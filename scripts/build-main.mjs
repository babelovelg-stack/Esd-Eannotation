import { mkdir } from "node:fs/promises"

import { build } from "esbuild"

await mkdir("dist", { recursive: true })

await build({
  entryPoints: ["src/plugin/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  format: "iife",
  target: "es2017",
  platform: "browser",
  sourcemap: false,
  logLevel: "info",
})
