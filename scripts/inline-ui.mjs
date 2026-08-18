import { access, rm, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const distDir = path.resolve("dist")
const indexPath = path.join(distDir, "index.html")
const uiPath = path.join(distDir, "ui.html")
const MIME_TYPES = {
  ".avif": "image/avif",
  ".css": "text/css",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

let html = await readFile(indexPath, "utf8")

html = html
  .replace(/\s*<link[^>]+rel=["']icon["'][^>]*>\s*/g, "\n")
  .replace(/<title>.*?<\/title>/, "<title>Esd-Eannotation</title>")

html = await inlineScripts(html)
html = await inlineStyles(html)
html = await inlineLocalAssets(html)

assertNoLocalRuntimeReferences(html, "before dist asset cleanup")

await rm(indexPath, { force: true })
await rm(path.join(distDir, "assets"), { recursive: true, force: true })
await rm(path.join(distDir, "vite.svg"), { force: true })
assertNoLocalRuntimeReferences(html, "after dist asset cleanup")
await writeFile(uiPath, html)

async function inlineScripts(source) {
  const scriptPattern =
    /<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/g
  const matches = Array.from(source.matchAll(scriptPattern))
  let output = source
  const scripts = []

  for (const match of matches) {
    const [tag, , src] = match
    const file = escapeInlineScript(await readAsset(src))
    scripts.push(`<script>${file}</script>`)
    output = output.replace(tag, "")
  }

  if (scripts.length > 0) {
    output = output.replace("</body>", () => `${scripts.join("\n")}\n  </body>`)
  }

  return output
}

async function inlineStyles(source) {
  const stylePattern = /<link\b([^>]*)\bhref=["']([^"']+\.css)["']([^>]*)>/g
  const matches = Array.from(source.matchAll(stylePattern))
  let output = source

  for (const match of matches) {
    const [tag, , href] = match
    const file = await readAsset(href)
    output = output.replace(tag, () => `<style>${file}</style>`)
  }

  return output
}

async function readAsset(assetPath) {
  return readFile(await resolveAssetPath(assetPath), "utf8")
}

function escapeInlineScript(source) {
  return source.replace(/<\/script/gi, "<\\/script")
}

async function inlineLocalAssets(source) {
  const references = collectLocalRuntimeReferences(source)
  let output = source

  for (const reference of references) {
    const filePath = await resolveAssetPath(reference)
    const extension = path.extname(filePath).toLowerCase()
    const mimeType = MIME_TYPES[extension] ?? "application/octet-stream"
    const dataUri = `data:${mimeType};base64,${(await readFile(filePath)).toString("base64")}`
    output = output.replaceAll(reference, dataUri)
  }

  return output
}

function collectLocalRuntimeReferences(source) {
  const references = new Set()

  const attributePattern = /\b(?:src|href)\s*=\s*(["'])(.*?)\1/gis
  for (const match of source.matchAll(attributePattern)) {
    if (isLocalRuntimeReference(match[2])) {
      references.add(match[2])
    }
  }

  const cssUrlPattern = /\burl\(\s*(?:(["'])(.*?)\1|([^\s)]+))\s*\)/gis
  for (const match of source.matchAll(cssUrlPattern)) {
    const value = match[2] ?? match[3]
    if (value && isLocalRuntimeReference(value)) {
      references.add(value)
    }
  }

  const bareAssetPattern = /(?:\/|\.\.?\/)assets\/[^"'`<>\s)]+/g
  for (const match of source.matchAll(bareAssetPattern)) {
    if (isLocalRuntimeReference(match[0])) {
      references.add(match[0])
    }
  }

  return references
}

function isLocalRuntimeReference(value) {
  const reference = value.trim()
  if (!reference || reference.includes("${")) {
    return false
  }
  if (
    reference.startsWith("data:") ||
    reference.startsWith("blob:") ||
    reference.startsWith("#") ||
    /^[a-z][a-z\d+.-]*:/i.test(reference) ||
    reference.startsWith("//")
  ) {
    return false
  }

  return (
    reference.startsWith("/") ||
    reference.startsWith("./") ||
    reference.startsWith("../")
  )
}

async function resolveAssetPath(assetReference) {
  const cleanPath = assetReference.split(/[?#]/, 1)[0].replace(/^\/+/, "")
  const candidates = [
    path.resolve(distDir, cleanPath),
    path.resolve(process.cwd(), cleanPath),
  ]

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next build/source-root candidate.
    }
  }

  throw new Error(`Unable to inline local runtime asset: ${assetReference}`)
}

function assertNoLocalRuntimeReferences(source, phase) {
  const references = collectLocalRuntimeReferences(source)
  const externalEntryPoints = []
  const entryPointPattern = /<(?:script|link)\b[^>]+(?:src|href)\s*=\s*(["'])(.*?)\1[^>]*>/gis
  for (const match of source.matchAll(entryPointPattern)) {
    if (!match[2].startsWith("data:") && !match[2].startsWith("blob:")) {
      externalEntryPoints.push(match[2])
    }
  }

  const machinePaths =
    source.match(/(?<![A-Za-z])(?:\/Users\/|\/home\/|[A-Za-z]:[\\/])/g) ?? []
  if (references.size || externalEntryPoints.length || machinePaths.length) {
    const details = [
      ...[...references].map((reference) => `local=${reference}`),
      ...externalEntryPoints.map((reference) => `entry=${reference}`),
      ...machinePaths.map((reference) => `machine=${reference}`),
    ]
    throw new Error(`${phase}: non-inline runtime references remain (${details.join(", ")})`)
  }
}
