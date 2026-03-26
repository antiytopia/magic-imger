import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { processBatch, processImage } from "../src/core/pipeline.js";
import { ResolvedJob } from "../src/shared/types.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "magic-imger-pipeline-"));
  tempDirs.push(dir);
  return dir;
}

function createGradientBuffer(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3;
      buffer[index] = (x * 17 + y * 3) % 256;
      buffer[index + 1] = (x * 5 + y * 11) % 256;
      buffer[index + 2] = (x * 13 + y * 7) % 256;
    }
  }

  return buffer;
}

async function createFixture(
  dir: string,
  name: string,
  options: { width: number; height: number; format: "png" | "jpg" | "webp" }
): Promise<string> {
  const filePath = path.join(dir, name);
  const buffer = createGradientBuffer(options.width, options.height);

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

describe("processing pipeline", () => {
  it("resizes with contain and converts to webp", async () => {
    const dir = await createTempDir();
    const inputPath = await createFixture(dir, "source.png", {
      width: 1200,
      height: 800,
      format: "png"
    });
    const outputPath = path.join(dir, "result.webp");

    const result = await processImage({
      id: "job-1",
      inputPath,
      outputPath,
      targetFormat: "webp",
      resize: {
        width: 600,
        height: 600,
        fit: "contain"
      }
    });

    expect(result.format).toBe("webp");
    expect(result.width).toBe(600);
    expect(result.height).toBe(400);

    const metadata = await sharp(await readFile(outputPath)).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(600);
    expect(metadata.height).toBe(400);
  });

  it("uses cover plus center crop to create an exact size output", async () => {
    const dir = await createTempDir();
    const inputPath = await createFixture(dir, "cover.jpg", {
      width: 1200,
      height: 800,
      format: "jpg"
    });
    const outputPath = path.join(dir, "cover-result.jpg");

    const result = await processImage({
      id: "job-2",
      inputPath,
      outputPath,
      targetFormat: "jpg",
      resize: {
        width: 300,
        height: 300,
        fit: "cover",
        crop: "center"
      }
    });

    expect(result.width).toBe(300);
    expect(result.height).toBe(300);
  });

  it("writes smaller jpeg files when lower quality is requested", async () => {
    const dir = await createTempDir();
    const inputPath = await createFixture(dir, "quality-source.jpg", {
      width: 1600,
      height: 1200,
      format: "jpg"
    });
    const highOutputPath = path.join(dir, "high.jpg");
    const lowOutputPath = path.join(dir, "low.jpg");

    const highQuality = await processImage({
      id: "job-3-high",
      inputPath,
      outputPath: highOutputPath,
      targetFormat: "jpg",
      compress: {
        quality: 90
      }
    });
    const lowQuality = await processImage({
      id: "job-3-low",
      inputPath,
      outputPath: lowOutputPath,
      targetFormat: "jpg",
      compress: {
        quality: 35
      }
    });

    expect(lowQuality.fileSizeBytes).toBeLessThan(highQuality.fileSizeBytes);
    expect((await readFile(lowOutputPath)).byteLength).toBe(lowQuality.fileSizeBytes);
  });

  it("processes a batch and keeps per-file failures isolated", async () => {
    const dir = await createTempDir();
    const inputPath = await createFixture(dir, "batch-source.png", {
      width: 800,
      height: 600,
      format: "png"
    });
    const jobs: ResolvedJob[] = [
      {
        id: "job-ok",
        inputPath,
        outputPath: path.join(dir, "batch-ok.webp"),
        targetFormat: "webp"
      },
      {
        id: "job-fail",
        inputPath: path.join(dir, "missing.png"),
        outputPath: path.join(dir, "batch-fail.webp"),
        targetFormat: "webp"
      }
    ];

    const results = await processBatch(jobs, 2);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      jobId: "job-ok",
      status: "success",
      format: "webp"
    });
    expect(results[1]).toMatchObject({
      jobId: "job-fail",
      status: "failed"
    });
    expect("error" in results[1] && results[1].error.length > 0).toBe(true);
  });
});
