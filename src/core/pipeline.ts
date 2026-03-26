import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { BatchJobResult, ProcessedJobResult, ResolvedJob } from "../shared/types.js";

function applyResize(image: sharp.Sharp, job: ResolvedJob): sharp.Sharp {
  if (!job.resize) {
    return image;
  }

  return image.resize({
    width: job.resize.width,
    height: job.resize.height,
    fit: job.resize.fit === "contain" ? "inside" : "cover",
    position: job.resize.crop === "center" ? "centre" : "centre"
  });
}

function getQuality(job: ResolvedJob, fallback: number): number {
  return job.compress?.quality ?? fallback;
}

function applyTargetFormat(image: sharp.Sharp, job: ResolvedJob): sharp.Sharp {
  switch (job.targetFormat) {
    case "png":
      return job.compress?.lossless
        ? image.png({
            compressionLevel: 9,
            adaptiveFiltering: true
          })
        : image.png({
            quality: getQuality(job, 80),
            compressionLevel: 9,
            adaptiveFiltering: true,
            palette: true,
            effort: 10
          });
    case "webp":
      return image.webp({
        quality: getQuality(job, 80),
        lossless: job.compress?.lossless ?? false
      });
    case "avif":
      return image.avif({
        quality: getQuality(job, 55),
        lossless: job.compress?.lossless ?? false
      });
    case "jpg":
    default:
      return image.jpeg({
        quality: getQuality(job, 82)
      });
  }
}

async function ensureOutputDirectory(outputPath: string): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
}

async function buildProcessedResult(job: ResolvedJob): Promise<ProcessedJobResult> {
  const [fileStats, outputBuffer] = await Promise.all([stat(job.outputPath), readFile(job.outputPath)]);
  const metadata = await sharp(outputBuffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read output metadata: ${job.outputPath}`);
  }

  return {
    jobId: job.id,
    outputPath: job.outputPath,
    format: job.targetFormat,
    fileSizeBytes: fileStats.size,
    width: metadata.width,
    height: metadata.height
  };
}

export async function processImage(job: ResolvedJob): Promise<ProcessedJobResult> {
  await ensureOutputDirectory(job.outputPath);

  let image = sharp(job.inputPath).rotate();
  image = applyResize(image, job);
  image = applyTargetFormat(image, job);

  await image.toFile(job.outputPath);

  return buildProcessedResult(job);
}

async function worker(queue: ResolvedJob[], results: BatchJobResult[]): Promise<void> {
  while (queue.length > 0) {
    const job = queue.shift();

    if (!job) {
      return;
    }

    try {
      const processed = await processImage(job);
      results.push({
        ...processed,
        status: "success"
      });
    } catch (error) {
      results.push({
        jobId: job.id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export async function processBatch(jobs: ResolvedJob[], concurrency = 1): Promise<BatchJobResult[]> {
  const normalizedConcurrency = Math.max(1, Math.floor(concurrency));
  const queue = [...jobs];
  const results: BatchJobResult[] = [];

  await Promise.all(
    Array.from({ length: Math.min(normalizedConcurrency, jobs.length) }, async () => worker(queue, results))
  );

  const order = new Map(jobs.map((job, index) => [job.id, index]));
  results.sort((left, right) => (order.get(left.jobId) ?? 0) - (order.get(right.jobId) ?? 0));

  return results;
}
