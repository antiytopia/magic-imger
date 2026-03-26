import { stat } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { MAX_BATCH_FILES } from "../shared/config.js";
import { InputAsset, OutputPathOptions } from "../shared/types.js";

const SUPPORTED_EXTENSIONS = new Set<InputAsset["extension"]>(["jpg", "png", "webp", "avif"]);

function normalizeExtension(filePath: string): InputAsset["extension"] {
  const extension = path.extname(filePath).slice(1).toLowerCase();

  if (extension === "jpeg") {
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

export async function readInputAssets(inputPaths: string[]): Promise<InputAsset[]> {
  if (inputPaths.length > MAX_BATCH_FILES) {
    throw new Error(`Batch limit exceeded: maximum ${MAX_BATCH_FILES} files per run.`);
  }

  return Promise.all(
    inputPaths.map(async (inputPath, index) => {
      const extension = normalizeExtension(inputPath);
      const [metadata, fileStats] = await Promise.all([sharp(inputPath).metadata(), stat(inputPath)]);

      if (!metadata.width || !metadata.height) {
        throw new Error(`Could not read image metadata: ${inputPath}`);
      }

      return {
        id: `${index}:${inputPath}`,
        inputPath,
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
