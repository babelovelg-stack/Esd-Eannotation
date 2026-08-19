import { readFile } from "node:fs/promises"

const PUBLIC_NAME = "Esd-Eannotation"
const PUBLIC_RELAUNCH_LABEL = "Open Esd-Eannotation"
const REQUIRED_COMMUNITY_DOCS = [
  "../community/README.md",
  "../community/listing-copy.md",
  "../community/privacy-policy.md",
  "../community/review-checklist.md",
]
const OPTIONAL_COMMUNITY_DOCS = [
  "../community/data-security.md",
  "../community/support-template.md",
  "../community/release-notes.md",
  "../community/playground-file-plan.md",
]

async function readOptionalFile(url) {
  try {
    return await readFile(url, "utf8")
  } catch (error) {
    if (error?.code === "ENOENT") return ""
    throw error
  }
}

const [mainSource, annotationModelSource, manifestSource, indexSource, inlineUiSource, appSource, bootSource, assetValidatorSource, agentsSource, designSource, ...communitySources] =
  await Promise.all([
    readFile(new URL("../src/plugin/main.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/shared/annotation-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("./inline-ui.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("./build-community-assets.py", import.meta.url), "utf8"),
    readOptionalFile(new URL("../AGENTSs.md", import.meta.url)),
    readFile(new URL("../Design.md", import.meta.url), "utf8"),
    ...REQUIRED_COMMUNITY_DOCS.map((path) =>
      readFile(new URL(path, import.meta.url), "utf8")
    ),
    ...OPTIONAL_COMMUNITY_DOCS.map((path) =>
      readOptionalFile(new URL(path, import.meta.url))
    ),
  ])

const manifest = JSON.parse(manifestSource)
const bareLegacyName = /(?<![A-Za-z-])Eannotation(?![A-Za-z-])/u

function hasBareLegacyName(source) {
  const withoutExplicitInternalNames = source.replace(
    /`(?:Eannotation \/ [^`]+|Anno \/ [^`]+)`/gu,
    ""
  )
  return bareLegacyName.test(withoutExplicitInternalNames)
}

function check(label, passed) {
  return [label, Boolean(passed)]
}

const uiPublicSources = [indexSource, inlineUiSource, appSource, bootSource]
const publicRelaunchSources = [manifestSource, mainSource, indexSource, appSource, bootSource]
const requirements = [
  check("manifest public name", manifest.name === PUBLIC_NAME),
  check("manifest plugin ID", manifest.id === "1671594491317346512"),
  check(
    "manifest relaunch button",
    Array.isArray(manifest.relaunchButtons) &&
      manifest.relaunchButtons.length === 1 &&
      manifest.relaunchButtons[0]?.command === "open" &&
      manifest.relaunchButtons[0]?.name === PUBLIC_RELAUNCH_LABEL &&
      manifest.relaunchButtons[0]?.multipleSelection === true
  ),
  check(
    "manifest network access",
    Array.isArray(manifest.networkAccess?.allowedDomains) &&
      manifest.networkAccess.allowedDomains.length === 1 &&
      manifest.networkAccess.allowedDomains[0] === "none"
  ),
  check(
    'PLUGIN_DATA_KEY = "anno"',
    /const PLUGIN_DATA_KEY = "anno"/.test(mainSource)
  ),
  check(
    "Eannotation local-card creation convention",
    /function localAnnotationCardName\(canvasName: string\)[\s\S]*?Eannotation \/ \$\{canvasName\}/.test(
      annotationModelSource
    ) &&
      /function resolveLocalAnnotationCardName\([\s\S]*?localAnnotationCardName\(canvasName\)/.test(
        annotationModelSource
      ) &&
      /function updateLocalCardName\([\s\S]*?resolveLocalAnnotationCardName\(card\.name, canvasName\)/.test(
        mainSource
      )
  ),
  check(
    "Eannotation badge creation convention",
    /function createBadge\([\s\S]*?createAutoFrame\(`Eannotation \/ Badge \$\{number\}`/.test(
      mainSource
    )
  ),
  check(
    "Eannotation and Anno badge recognition branches",
    /node\.name\.startsWith\("Eannotation \/ Badge"\)[\s\S]*?node\.name\.startsWith\("Anno \/ Badge"\)/.test(
      mainSource
    )
  ),
  check(
    "legacy Anno badge-label recognition branch",
    /node\.name\.startsWith\("Anno \/ Badge label"\)/.test(mainSource)
  ),
  check(
    "single public relaunch label",
    new RegExp(`const PUBLIC_RELAUNCH_LABEL = "${PUBLIC_RELAUNCH_LABEL}"`).test(
      mainSource
    )
  ),
  check(
    "existing annotation relaunch refresh",
    /if \(existingAnnotation\) \{[\s\S]*?refreshAnnotationRelaunchData\(existingAnnotation\.card\)[\s\S]*?refreshAnnotationRelaunchData\(existingAnnotation\.badge\)/.test(
      mainSource
    )
  ),
  check(
    "current-page relaunch refresh path",
    /async function reconcileAnnotationIntegrity\([\s\S]*?refreshCurrentPageAnnotationRelaunchData\(\)[\s\S]*?function refreshCurrentPageAnnotationRelaunchData\([\s\S]*?getCurrentPageAnnoNodes\(\)[\s\S]*?refreshAnnotationRelaunchData\(node\)/.test(
      mainSource
    )
  ),
  check("index title", indexSource.includes(`<title>${PUBLIC_NAME}</title>`)),
  check("index icon alt", indexSource.includes(`alt="${PUBLIC_NAME}"`)),
  check(
    "inlined UI title",
    inlineUiSource.includes(`<title>${PUBLIC_NAME}</title>`)
  ),
  check("App image alts", (appSource.match(/alt="Esd-Eannotation"/g) || []).length >= 2),
  check(
    "App empty-state guidance",
    appSource.includes("Esd-Eannotation 会根据选择自动判断全局标注或局部标注。")
  ),
  check("boot fallback alt", bootSource.includes(`alt="${PUBLIC_NAME}"`)),
  check(
    "boot fallback errors",
    bootSource.includes("Esd-Eannotation UI 初始化失败")
  ),
  check(
    "asset validator is standard-library only and read-only",
    !/PIL|ImageDraw|ImageFont|\.save\(|mkdir\(/.test(assetValidatorSource)
  ),
  check(
    "asset validator checks approved asset names",
    [
      "icon-128.png",
      "thumbnail-1920x1080.png",
      "carousel-01-core.png",
      "carousel-02-workflow.png",
      "carousel-03-boundaries.png",
    ].every((name) => assetValidatorSource.includes(name))
  ),
  check("engineering notes public name", !hasBareLegacyName(agentsSource)),
  check("design specification public name", !hasBareLegacyName(designSource)),
  check(
    "no obsolete public relaunch label",
    !publicRelaunchSources.some((source) => source.includes("Open Eannotation"))
  ),
  check(
    "no legacy title, alt, boot, error, or empty-state branding",
    !uiPublicSources.some(hasBareLegacyName)
  ),
  check(
    "community docs contain no bare legacy public name",
    !communitySources.some(hasBareLegacyName)
  ),
]

const failures = requirements
  .filter(([, passed]) => !passed)
  .map(([label]) => label)

if (failures.length > 0) {
  console.error(`Brand compatibility check failed: ${failures.join(", ")}`)
  process.exitCode = 1
} else {
  console.log("Brand compatibility check passed.")
}
