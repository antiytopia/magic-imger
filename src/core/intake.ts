import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";

import { MAX_BATCH_FILES } from "../shared/config.js";
import { InputAsset, OutputPathOptions } from "../shared/types.js";

const SUPPORTED_EXTENSIONS = new Set<InputAsset["extension"]>(["jpg", "png", "webp", "avif"]);
const SVG_RASTERIZE_DENSITY = 72;

function normalizeExtension(filePath: string): InputAsset["extension"] {
  const extension = path.extname(filePath).slice(1).toLowerCase();

  if (extension === "jpeg" || extension === "jfif") {
    return "jpg";
  }

  if (!SUPPORTED_EXTENSIONS.has(extension as InputAsset["extension"])) {
    throw new Error(`Unsupported image format: ${extension || "unknown"}`);
  }

  return extension as InputAsset["extension"];
}

function getBaseName(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

async function rasterizeSvgToTempPng(inputPath: string): Promise<string> {
  const baseName = getBaseName(inputPath) || "svg";
  const dir = await mkdtemp(path.join(tmpdir(), "magic-imger-svg-"));
  const outputPath = path.join(dir, `${baseName}.png`);

  try {
    await sharp(inputPath, { density: SVG_RASTERIZE_DENSITY }).png().toFile(outputPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to rasterize SVG: ${inputPath}. Ensure the SVG has viewBox and/or explicit width/height. (${message})`
    );
  }

  return outputPath;
}

export async function readInputAssets(inputPaths: string[]): Promise<InputAsset[]> {
  if (inputPaths.length > MAX_BATCH_FILES) {
    throw new Error(`Batch limit exceeded: maximum ${MAX_BATCH_FILES} files per run.`);
  }

  return Promise.all(
    inputPaths.map(async (inputPath, index) => {
      const rawExtension = path.extname(inputPath).slice(1).toLowerCase();
      const effectiveInputPath =
        rawExtension === "svg" ? await rasterizeSvgToTempPng(inputPath) : inputPath;
      const extension = normalizeExtension(effectiveInputPath);
      const [metadata, fileStats] = await Promise.all([sharp(effectiveInputPath).metadata(), stat(effectiveInputPath)]);

      if (!metadata.width || !metadata.height) {
        throw new Error(`Could not read image metadata: ${inputPath}`);
      }

      return {
        id: `${index}:${inputPath}`,
        inputPath: effectiveInputPath,
        fileName: path.basename(inputPath),
        baseName: getBaseName(inputPath),
        extension,
        format: extension,
        width: metadata.width,
        height: metadata.height,
        fileSizeBytes: fileStats.size
      };
    })
  );
}

export function createOutputPath(options: OutputPathOptions): string {
  const fileName = `${options.asset.baseName}.${options.targetFormat}`;
  return path.normalize(path.join(options.outputDir, fileName));
}
