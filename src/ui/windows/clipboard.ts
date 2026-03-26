import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function createClipboardTempImage(inputBuffer: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "magic-imger-clipboard-"));
  const filePath = path.join(dir, `clipboard-${Date.now()}.png`);

  await writeFile(filePath, inputBuffer);

  return filePath;
}
