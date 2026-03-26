import type { JobConfigPatch } from "../../../../shared/types.js";

export type CompressionPreset =
  | "default"
  | "lossy_light"
  | "lossy_strong"
  | "lossy_max"
  | "lossless_max";

export type OutputFormat = "jpg" | "png" | "webp" | "avif";

export type CompressionOption = {
  value: CompressionPreset;
  label: string;
};

export function resolveTargetFormat(
  overrideTargetFormat?: JobConfigPatch["targetFormat"],
  globalTargetFormat?: OutputFormat,
  fallbackFormat: OutputFormat = "webp"
): OutputFormat {
  return overrideTargetFormat ?? globalTargetFormat ?? fallbackFormat;
}

export function getCompressionOptions(targetFormat: OutputFormat): CompressionOption[] {
  const sharedLossyOptions: CompressionOption[] = [
    { value: "default", label: "default" },
    { value: "lossy_light", label: "lossy light" },
    { value: "lossy_strong", label: "lossy strong" },
    { value: "lossy_max", label: "lossy max" }
  ];

  if (targetFormat === "jpg") {
    return [...sharedLossyOptions, { value: "lossless_max", label: "max quality (jpg)" }];
  }

  return [...sharedLossyOptions, { value: "lossless_max", label: "lossless max" }];
}

export function getCompressionPreset(
  compress?: JobConfigPatch["compress"],
  targetFormat: OutputFormat = "webp"
): CompressionPreset {
  if (!compress) {
    return "default";
  }

  if (compress.lossless || (targetFormat === "jpg" && (compress.quality ?? 0) >= 100)) {
    return "lossless_max";
  }

  const quality = compress.quality ?? 0;

  switch (targetFormat) {
    case "avif":
      if (quality >= 48) {
        return "lossy_light";
      }

      if (quality >= 34) {
        return "lossy_strong";
      }

      return "lossy_max";
    case "png":
      if (quality >= 92) {
        return "lossy_light";
      }

      if (quality >= 78) {
        return "lossy_strong";
      }

      return "lossy_max";
    case "jpg":
    case "webp":
    default:
      if (quality >= 88) {
        return "lossy_light";
      }

      if (quality >= 68) {
        return "lossy_strong";
      }

      return "lossy_max";
  }
}

export function getCompressFromPreset(
  preset: CompressionPreset,
  targetFormat: OutputFormat
): JobConfigPatch["compress"] | undefined {
  switch (preset) {
    case "lossy_light":
      switch (targetFormat) {
        case "avif":
          return { quality: 48 };
        case "png":
          return { quality: 92 };
        case "jpg":
        case "webp":
        default:
          return { quality: 88 };
      }
    case "lossy_strong":
      switch (targetFormat) {
        case "avif":
          return { quality: 34 };
        case "png":
          return { quality: 78 };
        case "jpg":
        case "webp":
        default:
          return { quality: 68 };
      }
    case "lossy_max":
      switch (targetFormat) {
        case "avif":
          return { quality: 18 };
        case "png":
          return { quality: 55 };
        case "jpg":
        case "webp":
        default:
          return { quality: 38 };
      }
    case "lossless_max":
      return targetFormat === "jpg" ? { quality: 100 } : { quality: 100, lossless: true };
    case "default":
    default:
      return undefined;
  }
}

