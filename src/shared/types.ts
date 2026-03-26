export type ResourceProfileName = "safe" | "balanced";

export interface ResourceProfile {
  name: ResourceProfileName;
  maxRamMb: number;
  processingJobs: number;
  previewJobs: number;
}

export interface ImageAssetMetadata {
  id: string;
  format: "jpg" | "png" | "webp" | "avif";
  width: number;
  height: number;
  fileSizeBytes: number;
}

export interface InputAsset extends ImageAssetMetadata {
  inputPath: string;
  fileName: string;
  baseName: string;
  extension: "jpg" | "png" | "webp" | "avif";
}

export interface OutputPathOptions {
  asset: InputAsset;
  outputDir: string;
  targetFormat: "jpg" | "png" | "webp" | "avif";
}

export interface JobConfigPatch {
  targetFormat?: "jpg" | "png" | "webp" | "avif";
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
  outputDir?: string;
}

export interface ResizeOptions {
  width: number;
  height: number;
  fit: "contain" | "cover";
  crop?: "center";
}

export interface CompressOptions {
  quality?: number;
  lossless?: boolean;
}

export type ScreenshotBrowserMode =
  | "bundled-chromium"
  | "system-default"
  | "chrome"
  | "edge"
  | "firefox"
  | "custom-executable"
  | "cdp";

export type ScreenshotOutputFormat = "png";

export interface ScreenshotBrowserOptions {
  browserMode: ScreenshotBrowserMode;
  channel?: "chrome" | "msedge";
  executablePath?: string;
  cdpEndpoint?: string | null;
  headless?: boolean;
  proxy?: string | null;
}

export interface ScreenshotViewportOverride {
  width: number;
  height: number;
}

export interface ScreenshotJobOptions extends ScreenshotBrowserOptions {
  url: string;
  outDir: string;
  shots?: number;
  copiesPerScreen?: number;
  mobile?: boolean;
  deviceProfileName?: string | null;
  viewport?: ScreenshotViewportOverride;
  waitAfterNavigationMs?: number;
  betweenSegmentWaitMs?: number;
  maxImageBytes?: number;
  outputFormat?: ScreenshotOutputFormat;
}

export interface ScreenshotArtifact {
  path: string;
  copyIndex: number;
  segmentIndex: number;
  byteSize: number;
}

export interface ScreenshotBatchOptions extends Omit<ScreenshotJobOptions, "url"> {
  urls: string[];
}

export interface ScreenshotBatchEntryResult {
  url: string;
  status: "success" | "failed";
  artifacts: ScreenshotArtifact[];
  error?: string;
}

export interface ScreenshotBatchResult {
  batchDir: string;
  totalUrls: number;
  results: ScreenshotBatchEntryResult[];
}

export interface ScreenshotBrowserResolution {
  browserType: "chromium" | "firefox";
  launchStrategy: "launch" | "connectOverCDP";
  channel?: "chrome" | "msedge";
  executablePath?: string;
  cdpEndpoint?: string;
  resolvedFrom: ScreenshotBrowserMode;
  supportsProxy: boolean;
  warning: string | null;
}

export interface ResolvedJob {
  id: string;
  inputPath: string;
  outputPath: string;
  targetFormat: "jpg" | "png" | "webp" | "avif";
  resize?: ResizeOptions;
  compress?: CompressOptions;
}

export interface EstimatorInput {
  assets: ImageAssetMetadata[];
  targetFormat: "jpg" | "png" | "webp" | "avif";
  profile: ResourceProfileName;
}

export interface EstimateRange {
  min: number;
  max: number;
}

export interface PreflightEstimate {
  profile: ResourceProfileName;
  assetCount: number;
  estimatedRamMb: EstimateRange;
  estimatedDurationSeconds: EstimateRange;
  fitsProfileBudget: boolean;
  speedGainVsSafePercent: EstimateRange | null;
  warnings: string[];
}

export interface ProcessedJobResult {
  jobId: string;
  outputPath: string;
  format: "jpg" | "png" | "webp" | "avif";
  fileSizeBytes: number;
  width: number;
  height: number;
}

export interface FailedJobResult {
  jobId: string;
  status: "failed";
  error: string;
}

export interface SuccessfulJobResult extends ProcessedJobResult {
  status: "success";
}

export type BatchJobResult = SuccessfulJobResult | FailedJobResult;
