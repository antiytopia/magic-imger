import { readFile, rm } from "node:fs/promises";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { createClipboardTempImage } from "../src/ui/windows/clipboard.js";

const createdPaths: string[] = [];

afterEach(async () => {
  await Promise.all(createdPaths.splice(0).map((filePath) => rm(filePath, { force: true })));
});

describe("clipboard helper", () => {
  it("writes clipboard image buffers to a temporary png file", async () => {
    const inputBuffer = await sharp({
      create: {
        width: 120,
        height: 80,
        channels: 4,
        background: "#ff8844"
      }
    })
      .png()
      .toBuffer();

    const filePath = await createClipboardTempImage(inputBuffer);
    createdPaths.push(filePath);

    expect(filePath.endsWith(".png")).toBe(true);
    const outputBuffer = await readFile(filePath);
    const metadata = await sharp(outputBuffer).metadata();
    expect(metadata.width).toBe(120);
    expect(metadata.height).toBe(80);
    expect(metadata.format).toBe("png");
  });
});
