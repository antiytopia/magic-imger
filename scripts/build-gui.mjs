import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { build } from "esbuild";

const rootDir = process.cwd();
const outDir = path.join(rootDir, ".gui-dist");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

console.log(`[build-gui] node=${process.version} (js->ts resolver enabled)`);

const jsExtensionToTsPlugin = {
  name: "js-extension-to-ts",
  setup(esbuild) {
    const debug = process.env.MAGIC_IMGER_BUILD_DEBUG === "1";

    esbuild.onResolve({ filter: /.*/ }, (args) => {
      // Only rewrite relative imports (project files). Keep packages/URLs intact.
      if (!args.path.startsWith(".")) return null;

      // We only care about explicit ".js" relative imports (common pattern for TS->ESM builds).
      // Ignore non-js requests (or ones that already exist as-is).
      const withoutQuery = args.path.split("?")[0];
      if (!withoutQuery.endsWith(".js")) return null;

      const resolvedJs = path.resolve(args.resolveDir, withoutQuery);
      if (existsSync(resolvedJs)) {
        return null;
      }

      const candidates = [
        resolvedJs.replace(/\.js$/, ".ts"),
        resolvedJs.replace(/\.js$/, ".tsx"),
        resolvedJs.replace(/\.js$/, ".mts"),
        resolvedJs.replace(/\.js$/, ".cts")
      ];

      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          if (debug) {
            console.log(`[build-gui] resolve ${args.path} -> ${candidate}`);
          }
          return { path: candidate };
        }
      }

      if (debug) {
        console.log(`[build-gui] unresolved ${args.path} (tried: ${candidates.join(", ")})`);
      }
      return null;
    });
  }
};

await build({
  entryPoints: [path.join(rootDir, "src/ui/windows/main.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: path.join(outDir, "main.cjs"),
  plugins: [jsExtensionToTsPlugin],
  external: ["electron", "sharp", "playwright", "playwright-core", "chromium-bidi"]
});

await build({
  entryPoints: [path.join(rootDir, "src/ui/windows/preload.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: path.join(outDir, "preload.cjs"),
  plugins: [jsExtensionToTsPlugin],
  external: ["electron"]
});

await build({
  entryPoints: [path.join(rootDir, "src/ui/windows/app/main.tsx")],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "chrome120",
  outfile: path.join(outDir, "renderer.js"),
  plugins: [jsExtensionToTsPlugin],
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
