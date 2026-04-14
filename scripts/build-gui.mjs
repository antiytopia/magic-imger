import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { build } from "esbuild";

const rootDir = process.cwd();
const outDir = path.join(rootDir, ".gui-dist");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

console.log(`[build-gui] node=${process.version} (js->ts resolver enabled)`);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".gui-dist" || entry.name === "dist") {
        continue;
      }
      files.push(...(await walk(full)));
      continue;
    }

    files.push(full);
  }
  return files;
}

function parseRelativeJsImports(sourceText) {
  // Not a full parser, but works well for our codebase.
  const imports = [];
  const re = /\bfrom\s+["'](\.[^"']+?\.js)["']/g;
  for (;;) {
    const m = re.exec(sourceText);
    if (!m) break;
    imports.push(m[1]);
  }
  return imports;
}

function resolveImportCandidates(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const jsPath = base;
  const candidates = [
    jsPath,
    jsPath.replace(/\.js$/, ".ts"),
    jsPath.replace(/\.js$/, ".tsx"),
    jsPath.replace(/\.js$/, ".mts"),
    jsPath.replace(/\.js$/, ".cts")
  ];

  return candidates;
}

async function preflightCheck() {
  if (process.env.MAGIC_IMGER_SKIP_PREFLIGHT === "1") {
    return;
  }

  const roots = [
    path.join(rootDir, "src", "ui", "windows"),
    path.join(rootDir, "src", "core"),
    path.join(rootDir, "src", "shared")
  ];

  const targets = [];
  for (const r of roots) {
    if (existsSync(r)) targets.push(r);
  }

  const files = [];
  for (const targetDir of targets) {
    files.push(...(await walk(targetDir)));
  }

  const tsLike = files.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".mts") || f.endsWith(".cts"));
  const missing = [];

  for (const f of tsLike) {
    let text;
    try {
      text = await readFile(f, "utf8");
    } catch {
      continue;
    }

    const imports = parseRelativeJsImports(text);
    for (const spec of imports) {
      const candidates = resolveImportCandidates(f, spec);
      if (candidates.some((c) => existsSync(c))) {
        continue;
      }

      missing.push({ from: f, spec, tried: candidates });
    }
  }

  if (missing.length > 0) {
    console.error("[build-gui] Preflight failed: some source files are missing.");
    console.error("[build-gui] This usually means the user has a broken / partially updated folder.");
    console.error("[build-gui] Fix: re-download the project folder (or run `git pull` if using git).");
    for (const item of missing.slice(0, 25)) {
      console.error(`- ${item.spec} (from ${path.relative(rootDir, item.from)})`);
    }
    if (missing.length > 25) {
      console.error(`...and ${missing.length - 25} more`);
    }
    process.exitCode = 1;
    throw new Error("Preflight missing sources");
  }
}

await preflightCheck();

async function runBuilds({ debug }) {
  if (debug) {
    process.env.MAGIC_IMGER_BUILD_DEBUG = "1";
  } else if (process.env.MAGIC_IMGER_BUILD_DEBUG) {
    delete process.env.MAGIC_IMGER_BUILD_DEBUG;
  }

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
    jsx: "automatic",
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
}

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

try {
  await runBuilds({ debug: false });
} catch (err) {
  console.error("[build-gui] Build failed.");
  console.error("[build-gui] Re-running once with debug logs enabled (MAGIC_IMGER_BUILD_DEBUG=1)...");
  try {
    await runBuilds({ debug: true });
  } catch {
    // ignore; original error is more relevant
  }
  throw err;
}
