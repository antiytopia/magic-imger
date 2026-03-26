import { readFile } from "node:fs/promises";

import { Command } from "commander";

import { processBatch } from "../core/pipeline.js";
import { planBatch } from "../core/planner.js";
import { ResourceBudgetExceededError } from "../core/resources.js";
import { runShotBatch } from "../core/screenshots/run-shot-batch.js";
import { ResourceProfileName, ScreenshotBatchResult, ScreenshotBrowserMode } from "../shared/types.js";

function parseInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return parsed;
}

function parseOptionalInteger(value: string | undefined, label: string): number | undefined {
  return value ? parseInteger(value, label) : undefined;
}

function parseScreenshotBrowserMode(value: string | undefined): ScreenshotBrowserMode {
  const normalized = value?.trim() ?? "bundled-chromium";
  const allowed: ScreenshotBrowserMode[] = [
    "bundled-chromium",
    "system-default",
    "chrome",
    "edge",
    "firefox",
    "custom-executable",
    "cdp"
  ];

  if (!allowed.includes(normalized as ScreenshotBrowserMode)) {
    throw new Error(`Unsupported browser mode: ${value}`);
  }

  return normalized as ScreenshotBrowserMode;
}

async function readUrlsFile(filePath: string): Promise<string[]> {
  const content = await readFile(filePath, "utf8");

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

async function resolveShootUrls(inputs: string[], urlsFile?: string): Promise<string[]> {
  if (inputs.length > 0) {
    return inputs;
  }

  if (!urlsFile) {
    throw new Error("Provide URLs as arguments or pass --urls-file <path>.");
  }

  return readUrlsFile(urlsFile);
}

function printPreflightSummary(summary: Awaited<ReturnType<typeof planBatch>>["estimate"]): void {
  console.log("Preflight summary");
  console.log(`Profile: ${summary.profile}`);
  console.log(`Assets: ${summary.assetCount}`);
  console.log(`Estimated RAM: ${summary.estimatedRamMb.min}-${summary.estimatedRamMb.max} MB`);
  console.log(
    `Estimated duration: ${summary.estimatedDurationSeconds.min}-${summary.estimatedDurationSeconds.max} sec`
  );

  if (summary.speedGainVsSafePercent) {
    console.log(
      `Estimated speed gain vs safe: ${summary.speedGainVsSafePercent.min}-${summary.speedGainVsSafePercent.max}%`
    );
  }

  if (summary.warnings.length > 0) {
    console.log(`Warnings: ${summary.warnings.join(" | ")}`);
  }
}

async function runPlannedBatch(plan: Awaited<ReturnType<typeof planBatch>>): Promise<void> {
  const results = await processBatch(plan.jobs, plan.concurrency);
  const successCount = results.filter((result) => result.status === "success").length;
  const failedCount = results.filter((result) => result.status === "failed").length;

  console.log(`Done: ${successCount} success, ${failedCount} failed`);

  for (const result of results) {
    if (result.status === "failed") {
      console.log(`Failed job ${result.jobId}: ${result.error}`);
    }
  }
}

function printScreenshotSummary(summary: ScreenshotBatchResult): void {
  const successCount = summary.results.filter((result) => result.status === "success").length;
  const failedCount = summary.results.length - successCount;

  console.log(`Screenshot batch complete: ${successCount} success, ${failedCount} failed`);
  console.log(`Files stored under: ${summary.batchDir}`);

  for (const result of summary.results) {
    if (result.status === "success") {
      console.log(`- ${result.url}: ${result.artifacts.length} file(s)`);
    } else {
      console.log(`- ${result.url}: failed - ${result.error}`);
    }
  }
}

function addCommonOptions(command: Command): Command {
  return command
    .requiredOption("-o, --output <dir>", "output directory")
    .option("--resource-profile <profile>", "resource profile", "safe");
}

async function executeCommand(
  inputs: string[],
  options: {
    output: string;
    resourceProfile: ResourceProfileName;
    to?: "jpg" | "png" | "webp" | "avif";
    width?: number;
    height?: number;
    fit?: "contain" | "cover";
    crop?: "center";
    quality?: number;
    lossless?: boolean;
  }
): Promise<void> {
  const plan = await planBatch({
    inputs,
    outputDir: options.output,
    targetFormat: options.to,
    profile: options.resourceProfile,
    resize:
      options.width && options.height && options.fit
        ? {
            width: options.width,
            height: options.height,
            fit: options.fit,
            crop: options.crop
          }
        : undefined,
    compress:
      options.quality !== undefined || options.lossless
        ? {
            quality: options.quality,
            lossless: options.lossless
          }
        : undefined
  });

  printPreflightSummary(plan.estimate);
  await runPlannedBatch(plan);
}

export async function main(argv: string[]): Promise<void> {
  const program = new Command();

  program.name("magic-imger").description("SEO image pipeline tool");

  addCommonOptions(
    program
      .command("convert")
      .argument("<inputs...>", "input image file paths")
      .requiredOption("--to <format>", "target format (jpg|png|webp|avif)")
  ).action(async (inputs: string[], options: { output: string; resourceProfile: ResourceProfileName; to: "jpg" | "png" | "webp" | "avif" }) => {
    await executeCommand(inputs, options);
  });

  addCommonOptions(
    program
      .command("resize")
      .argument("<inputs...>", "input image file paths")
      .requiredOption("--width <number>", "target width")
      .requiredOption("--height <number>", "target height")
      .option("--to <format>", "target format (jpg|png|webp|avif)")
      .option("--fit <fit>", "resize fit", "contain")
      .option("--crop <crop>", "crop mode")
  ).action(
    async (
      inputs: string[],
      options: {
        output: string;
        resourceProfile: ResourceProfileName;
        to?: "jpg" | "png" | "webp" | "avif";
        width: string;
        height: string;
        fit: "contain" | "cover";
        crop?: "center";
      }
    ) => {
      await executeCommand(inputs, {
        ...options,
        width: parseInteger(options.width, "width"),
        height: parseInteger(options.height, "height")
      });
    }
  );

  addCommonOptions(
    program
      .command("compress")
      .argument("<inputs...>", "input image file paths")
      .option("--to <format>", "target format (jpg|png|webp|avif)")
      .option("--quality <number>", "compression quality")
      .option("--lossless", "prefer lossless compression", false)
  ).action(
    async (
      inputs: string[],
      options: {
        output: string;
        resourceProfile: ResourceProfileName;
        to?: "jpg" | "png" | "webp" | "avif";
        quality?: string;
        lossless?: boolean;
      }
    ) => {
      await executeCommand(inputs, {
        ...options,
        quality: options.quality ? parseInteger(options.quality, "quality") : undefined
      });
    }
  );

  program
    .command("shoot")
    .description("capture segmented screenshots for one or more URLs")
    .argument("[urls...]", "URL(s) to capture")
    .requiredOption("-o, --output <dir>", "output directory")
    .option("--urls-file <path>", "text file with URLs, one per line")
    .option("--shots <number>", "segments per page")
    .option("--copies-per-screen <number>", "copies per captured segment")
    .option("--mobile", "use mobile mode", false)
    .option("--device <name>", "Playwright device profile name")
    .option("--browser <mode>", "bundled-chromium|system-default|chrome|edge|firefox|custom-executable|cdp")
    .option("--browser-path <path>", "path to a browser executable")
    .option("--cdp <endpoint>", "connect to an existing Chromium browser over CDP")
    .option("--channel <channel>", "chrome or msedge")
    .option("--proxy <server>", "proxy server")
    .option("--headless", "run browser headless", false)
    .option("--wait-after-nav-ms <number>", "extra wait after navigation")
    .option("--between-segment-wait-ms <number>", "wait between segment captures")
    .option("--max-image-bytes <number>", "target maximum bytes per image")
    .action(
      async (
        inputs: string[],
        options: {
          output: string;
          urlsFile?: string;
          shots?: string;
          copiesPerScreen?: string;
          mobile?: boolean;
          device?: string;
          browser?: string;
          browserPath?: string;
          cdp?: string;
          channel?: "chrome" | "msedge";
          proxy?: string;
          headless?: boolean;
          waitAfterNavMs?: string;
          betweenSegmentWaitMs?: string;
          maxImageBytes?: string;
        }
      ) => {
        const urls = await resolveShootUrls(inputs, options.urlsFile);
        const summary = await runShotBatch({
          urls,
          outDir: options.output,
          shots: parseOptionalInteger(options.shots, "shots"),
          copiesPerScreen: parseOptionalInteger(options.copiesPerScreen, "copies-per-screen"),
          mobile: options.mobile,
          deviceProfileName: options.device,
          browserMode: options.cdp ? "cdp" : parseScreenshotBrowserMode(options.browser),
          executablePath: options.browserPath,
          cdpEndpoint: options.cdp,
          channel: options.channel,
          proxy: options.proxy,
          headless: options.headless,
          waitAfterNavigationMs: parseOptionalInteger(options.waitAfterNavMs, "wait-after-nav-ms"),
          betweenSegmentWaitMs: parseOptionalInteger(
            options.betweenSegmentWaitMs,
            "between-segment-wait-ms"
          ),
          maxImageBytes: parseOptionalInteger(options.maxImageBytes, "max-image-bytes")
        });

        printScreenshotSummary(summary);
      }
    );

  try {
    await program.parseAsync(argv.slice(2), { from: "user" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: ${message}`);
    process.exitCode = error instanceof ResourceBudgetExceededError ? 2 : 1;
  }
}

void main(process.argv);
