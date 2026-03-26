import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { planBatch } from "../src/core/planner.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "magic-imger-planner-"));
  tempDirs.push(dir);
  return dir;
}

async function createFixture(
  dir: string,
  name: string,
  options: { width: number; height: number; format: "png" | "jpg" | "webp" }
): Promise<string> {
  const filePath = path.join(dir, name);
  const buffer = Buffer.alloc(options.width * options.height * 3, 180);

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

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("planner", () => {
  it("builds jobs from global preset and applies per-item overrides", async () => {
    const dir = await createTempDir();
    const first = await createFixture(dir, "first.png", {
      width: 800,
      height: 600,
      format: "png"
    });
    const second = await createFixture(dir, "second.png", {
      width: 1200,
      height: 800,
      format: "png"
    });
    const outputDir = path.join(dir, "out");

    const plan = await planBatch({
      inputs: [first, second],
      outputDir,
      targetFormat: "webp",
      profile: "safe",
      resize: {
        width: 600,
        height: 600,
        fit: "contain"
      },
      compress: {
        quality: 82
      },
      itemOverrides: {
        [`1:${second}`]: {
          targetFormat: "jpg",
          compress: {
            quality: 35
          }
        }
      }
    });

    expect(plan.jobs).toHaveLength(2);
    expect(plan.jobs[0]).toMatchObject({
      targetFormat: "webp",
      compress: {
        quality: 82
      },
      outputPath: path.join(outputDir, "first.webp")
    });
    expect(plan.jobs[1]).toMatchObject({
      targetFormat: "jpg",
      compress: {
        quality: 35
      },
      outputPath: path.join(outputDir, "second.jpg")
    });
  });
});
