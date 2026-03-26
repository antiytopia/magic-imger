import { createPreflightEstimate } from "./estimator.js";
import { createOutputPath, readInputAssets } from "./intake.js";
import { assertEstimateFitsProfile, getResourceProfile } from "./resources.js";
import { InputAsset, JobConfigPatch, PreflightEstimate, ResolvedJob, ResourceProfileName } from "../shared/types.js";

export interface PlanJobsOptions {
  inputs: string[];
  outputDir: string;
  targetFormat?: "jpg" | "png" | "webp" | "avif";
  profile: ResourceProfileName;
  resize?: {
    width: number;
    height: number;
    fit: "contain" | "cover";
    crop?: "center";
  };
  compress?: {
    quality?: number;
    lossless?: boolean;
  };
  itemOverrides?: Record<string, JobConfigPatch>;
}

export interface PlannedBatch {
  assets: InputAsset[];
  estimate: PreflightEstimate;
  jobs: ResolvedJob[];
  concurrency: number;
}

function resolveTargetFormat(
  asset: InputAsset,
  explicitTargetFormat?: "jpg" | "png" | "webp" | "avif",
  overrideTargetFormat?: "jpg" | "png" | "webp" | "avif"
): "jpg" | "png" | "webp" | "avif" {
  return overrideTargetFormat ?? explicitTargetFormat ?? asset.format;
}

function buildJobs(assets: InputAsset[], options: PlanJobsOptions): ResolvedJob[] {
  return assets.map((asset) => {
    const override = options.itemOverrides?.[asset.id];
    const targetFormat = resolveTargetFormat(asset, options.targetFormat, override?.targetFormat);
    const outputDir = override?.outputDir ?? options.outputDir;

    return {
      id: asset.id,
      inputPath: asset.inputPath,
      outputPath: createOutputPath({
        asset,
        outputDir,
        targetFormat
      }),
      targetFormat,
      resize: override?.resize ?? options.resize,
      compress: override?.compress ?? options.compress
    };
  });
}

export async function planBatch(options: PlanJobsOptions): Promise<PlannedBatch> {
  const assets = await readInputAssets(options.inputs);
  const estimate = createPreflightEstimate({
    assets,
    targetFormat: options.targetFormat ?? assets[0]?.format ?? "jpg",
    profile: options.profile
  });

  assertEstimateFitsProfile(estimate);

  return {
    assets,
    estimate,
    jobs: buildJobs(assets, options),
    concurrency: getResourceProfile(options.profile).processingJobs
  };
}
