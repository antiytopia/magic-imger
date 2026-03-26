import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "magic-imger-cli-"));
  tempDirs.push(dir);
  return dir;
}

async function createFixture(
  dir: string,
  name: string,
  options: { width: number; height: number; format: "png" | "jpg" | "webp" }
): Promise<string> {
  const filePath = path.join(dir, name);
  const buffer = Buffer.alloc(options.width * options.height * 3, 140);

  await sharp(buffer, {
    raw: {
      width: options.width,
      height: options.height,
      channels: 3
    }
  })
    .toFormat(options.format)
    .toFile(filePath);

  return filePath;
}

async function runCli(args: string[], cwd = "d:\\magic-imger"): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/cli/index.ts", ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("cli smoke tests", () => {
  it("runs convert command, prints preflight summary, and writes output", async () => {
    const dir = await createTempDir();
    const inputPath = await createFixture(dir, "sample.png", {
      width: 800,
      height: 600,
      format: "png"
    });
    const outputDir = path.join(dir, "out");

    const result = await runCli(["convert", inputPath, "--to", "webp", "--output", outputDir]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Preflight summary");
    expect(result.stdout).toContain("Profile: safe");
    expect(result.stdout).toContain("Done: 1 success, 0 failed");

    const outputPath = path.join(outputDir, "sample.webp");
    const metadata = await sharp(await readFile(outputPath)).metadata();
    expect(metadata.format).toBe("webp");
  });

  it("runs resize with balanced profile and reports the selected profile", async () => {
    const dir = await createTempDir();
    const inputPath = await createFixture(dir, "hero.jpg", {
      width: 1200,
      height: 800,
      format: "jpg"
    });
    const outputDir = path.join(dir, "resize-out");

    const result = await runCli([
      "resize",
      inputPath,
      "--width",
      "300",
      "--height",
      "300",
      "--fit",
      "contain",
      "--to",
      "webp",
      "--output",
      outputDir,
      "--resource-profile",
      "balanced"
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Profile: balanced");
    expect(result.stdout).toContain("Estimated speed gain vs safe:");
    const outputPath = path.join(outputDir, "hero.webp");
    const metadata = await sharp(await readFile(outputPath)).metadata();
    expect(metadata.width).toBe(300);
    expect(metadata.height).toBe(200);
  });

  it("fails with a non-zero exit code for unsupported commands or invalid args", async () => {
    const result = await runCli(["resize"]);

    expect(result.code).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("error");
  });
});
