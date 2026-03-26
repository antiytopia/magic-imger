import {
  EstimatorInput,
  ImageAssetMetadata,
  PreflightEstimate,
  ResourceProfileName
} from "../shared/types.js";
import { getResourceProfile } from "./resources.js";

function getFormatWeight(format: ImageAssetMetadata["format"]): number {
  switch (format) {
    case "png":
      return 1.25;
    case "webp":
      return 1;
    case "avif":
      return 1.4;
    case "jpg":
    default:
      return 0.95;
  }
}

function getTargetFormatWeight(targetFormat: EstimatorInput["targetFormat"]): number {
  switch (targetFormat) {
    case "png":
      return 1.15;
    case "webp":
      return 1;
    case "avif":
      return 1.35;
    case "jpg":
    default:
      return 0.9;
  }
}

function getPixelCount(asset: ImageAssetMetadata): number {
  return asset.width * asset.height;
}

function getBaseWorkUnits(asset: ImageAssetMetadata, targetFormat: EstimatorInput["targetFormat"]): number {
  const megapixels = getPixelCount(asset) / 1_000_000;
  return megapixels * getFormatWeight(asset.format) * getTargetFormatWeight(targetFormat);
}

function calculateWarnings(input: EstimatorInput): string[] {
  const warnings = new Set<string>();

  if (input.targetFormat === "avif") {
    warnings.add("AVIF encoding is slower and may have limited speed gain.");
  }

  if (input.assets.some((asset) => asset.format === "png")) {
    warnings.add("PNG-heavy batches tend to use more CPU and memory.");
  }

  if (input.assets.some((asset) => getPixelCount(asset) >= 20_000_000)) {
    warnings.add("Large source images detected.");
  }

  return [...warnings];
}

function getSafeEstimate(input: Omit<EstimatorInput, "profile">): PreflightEstimate {
  const profile = getResourceProfile("safe");
  const totalWorkUnits = input.assets.reduce((sum, asset) => sum + getBaseWorkUnits(asset, input.targetFormat), 0);
  const avgPixels =
    input.assets.reduce((sum, asset) => sum + getPixelCount(asset), 0) / Math.max(input.assets.length, 1);
  const avgMegapixels = avgPixels / 1_000_000;
  const estimatedRamPeak = Math.round(320 + avgMegapixels * 28 + totalWorkUnits * 6);
  const durationCenter = totalWorkUnits * 1.45;

  return {
    profile: "safe",
    assetCount: input.assets.length,
    estimatedRamMb: {
      min: Math.max(256, Math.round(estimatedRamPeak * 0.82)),
      max: estimatedRamPeak
    },
    estimatedDurationSeconds: {
      min: Math.max(1, Math.round(durationCenter * 0.9)),
      max: Math.max(2, Math.round(durationCenter * 1.2))
    },
    fitsProfileBudget: estimatedRamPeak <= profile.maxRamMb,
    speedGainVsSafePercent: null,
    warnings: calculateWarnings({ ...input, profile: "safe" })
  };
}

function getSpeedGainRange(input: Omit<EstimatorInput, "profile">): { min: number; max: number } {
  if (input.targetFormat === "avif") {
    return { min: 10, max: 40 };
  }

  if (input.assets.some((asset) => asset.format === "png") || input.targetFormat === "png") {
    return { min: 20, max: 50 };
  }

  return { min: 40, max: 80 };
}

export function createPreflightEstimate(input: EstimatorInput): PreflightEstimate {
  const baseInput = {
    assets: input.assets,
    targetFormat: input.targetFormat
  };
  const safeEstimate = getSafeEstimate(baseInput);

  if (input.profile === "safe") {
    return safeEstimate;
  }

  const profile = getResourceProfile("balanced");
  const speedGain = getSpeedGainRange(baseInput);
  const balancedMinDuration = Math.max(
    1,
    Math.round(safeEstimate.estimatedDurationSeconds.min / (1 + speedGain.max / 100))
  );
  const balancedMaxDuration = Math.max(
    2,
    Math.round(safeEstimate.estimatedDurationSeconds.max / (1 + speedGain.min / 100))
  );
  const balancedRamPeak = Math.round(safeEstimate.estimatedRamMb.max * 1.32);
  const balancedRamMax = balancedRamPeak;
  const balancedRamMin = Math.max(320, Math.round(balancedRamMax * 0.82));

  return {
    profile: input.profile satisfies ResourceProfileName,
    assetCount: input.assets.length,
    estimatedRamMb: {
      min: balancedRamMin,
      max: balancedRamMax
    },
    estimatedDurationSeconds: {
      min: balancedMinDuration,
      max: balancedMaxDuration
    },
    fitsProfileBudget: balancedRamPeak <= profile.maxRamMb,
    speedGainVsSafePercent: speedGain,
    warnings: calculateWarnings(input)
  };
}
