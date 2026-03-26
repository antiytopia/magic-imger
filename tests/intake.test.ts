import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { createPreflightEstimate } from "../src/core/estimator.js";
import { readInputAssets, createOutputPath } from "../src/core/intake.js";
import { assertEstimateFitsProfile, ResourceBudgetExceededError } from "../src/core/resources.js";

const tempDirs: string[] = [];

async function createTempImage(
  name: string,
  options: { width: number; height: number; format: "png" | "jpg" | "webp"; background: string }
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "magic-imger-"));
  tempDirs.push(dir);

  const filePath = path.join(dir, name);

  await sharp({
    create: {
      width: options.width,
      height: options.height,
      channels: 4,
      background: options.background
    }
  })
    .toFormat(options.format)
    .toFile(filePath);

  return filePath;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("file intake", () => {
  it("reads metadata from real image files", async () => {
    const pngPath = await createTempImage("alpha.png", {
      width: 320,
      height: 180,
      format: "png",
      background: "#ff0000"
    });
    const jpgPath = await createTempImage("beta.jpg", {
      width: 640,
      height: 360,
      format: "jpg",
      background: "#00ff00"
    });

    const assets = await readInputAssets([pngPath, jpgPath]);

    expect(assets).toHaveLength(2);
    expect(assets[0]).toMatchObject({
      inputPath: pngPath,
      fileName: "alpha.png",
      baseName: "alpha",
      extension: "png",
      format: "png",
      width: 320,
      height: 180
    });
    expect(assets[1]).toMatchObject({
      inputPath: jpgPath,
      fileName: "beta.jpg",
      baseName: "beta",
      extension: "jpg",
      format: "jpg",
      width: 640,
      height: 360
    });
    expect(assets[0].fileSizeBytes).toBeGreaterThan(0);
    expect(assets[1].fileSizeBytes).toBeGreaterThan(0);
  });

  it("rejects queues larger than 100 files before processing starts", async () => {
    const overLimitPaths = Array.from({ length: 101 }, (_, index) => `file-${index}.png`);

    await expect(readInputAssets(overLimitPaths)).rejects.toThrow(
      "Batch limit exceeded: maximum 100 files per run."
    );
  });

  it("creates output paths that preserve base names and change the extension", async () => {
    const pngPath = await createTempImage("hero.png", {
      width: 300,
      height: 200,
      format: "png",
      background: "#0000ff"
    });
    const assets = await readInputAssets([pngPath]);

    const outputPath = createOutputPath({
      asset: assets[0],
      outputDir: "D:/magic-imger/out",
      targetFormat: "webp"
    });

    expect(outputPath).toBe(path.normalize("D:/magic-imger/out/hero.webp"));
  });

  it("fails fast when a safe profile estimate exceeds the RAM budget", () => {
    const estimate = createPreflightEstimate({
      assets: [
        {
          id: "huge-1",
          format: "png",
          width: 20000,
          height: 20000,
          fileSizeBytes: 120_000_000
        },
        {
          id: "huge-2",
          format: "png",
          width: 20000,
          height: 20000,
          fileSizeBytes: 120_000_000
        }
      ],
      targetFormat: "png",
      profile: "safe"
    });

    expect(() => assertEstimateFitsProfile(estimate)).toThrow(ResourceBudgetExceededError);
  });
});
