import type { JobConfigPatch } from "../../../../shared/types.js";

export function hasStoredOverride(override?: JobConfigPatch): boolean {
  return Boolean(override?.targetFormat || override?.outputDir || override?.resize || override?.compress);
}

export function normalizeResize(resize?: JobConfigPatch["resize"]) {
  if (!resize) {
    return undefined;
  }

  const width = Number(resize.width) || 0;
  const height = Number(resize.height) || 0;

  if (width <= 0 || height <= 0) {
    return undefined;
  }

  return {
    width,
    height,
    fit: resize.fit
  };
}

export function normalizeCompress(compress?: JobConfigPatch["compress"]) {
  if (!compress) {
    return undefined;
  }

  const quality =
    compress.quality !== undefined && Number.isFinite(compress.quality) && compress.quality > 0
      ? compress.quality
      : undefined;

  if (quality === undefined && !compress.lossless) {
    return undefined;
  }

  return {
    quality,
    lossless: compress.lossless
  };
}

export function normalizeItemOverrides(itemOverrides: Record<string, JobConfigPatch>) {
  const entries = Object.entries(itemOverrides)
    .map(([assetId, override]) => {
      const nextOverride: JobConfigPatch = {};

      if (override.targetFormat) {
        nextOverride.targetFormat = override.targetFormat;
      }

      if (override.outputDir?.trim()) {
        nextOverride.outputDir = override.outputDir.trim();
      }

      if (override.resize) {
        const resize = normalizeResize(override.resize);
        if (resize) {
          nextOverride.resize = resize;
        }
      }

      if (override.compress) {
        const compress = normalizeCompress(override.compress);
        if (compress) {
          nextOverride.compress = compress;
        }
      }

      return hasStoredOverride(nextOverride) ? ([assetId, nextOverride] as const) : null;
    })
    .filter((entry): entry is readonly [string, JobConfigPatch] => entry !== null);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

