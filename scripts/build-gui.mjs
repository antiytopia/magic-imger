import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";

const rootDir = process.cwd();
const outDir = path.join(rootDir, ".gui-dist");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [path.join(rootDir, "src/ui/windows/main.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: path.join(outDir, "main.js"),
  external: ["electron", "sharp", "playwright", "playwright-core", "chromium-bidi"]
});

await build({
  entryPoints: [path.join(rootDir, "src/ui/windows/preload.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: path.join(outDir, "preload.cjs"),
  external: ["electron"]
});

await build({
  entryPoints: [path.join(rootDir, "src/ui/windows/app/main.tsx")],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "chrome120",
  outfile: path.join(outDir, "renderer.js"),
  loader: {
    ".css": "css"
  }
});

await writeFile(
  path.join(outDir, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Magic Imger</title>
    <link rel="stylesheet" href="./renderer.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./renderer.js"></script>
  </body>
</html>
`,
  "utf8"
);
