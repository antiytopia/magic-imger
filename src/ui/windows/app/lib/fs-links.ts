import type { MagicImgerBridge } from "../../preload.js";
import { getErrorMessage } from "./errors.js";

export async function openLocalPath(
  bridge: MagicImgerBridge,
  targetPath: string,
  setNotice: (message: string | null) => void
): Promise<void> {
  if (!targetPath.trim()) {
    setNotice("Path is empty.");
    return;
  }

  try {
    await bridge.openPath(targetPath);
  } catch (error) {
    setNotice(`Cannot open path: ${getErrorMessage(error)}`);
  }
}

export async function showItemInFolder(
  bridge: MagicImgerBridge,
  targetPath: string,
  setNotice: (message: string | null) => void
): Promise<void> {
  if (!targetPath.trim()) {
    setNotice("Path is empty.");
    return;
  }

  try {
    await bridge.showItemInFolder(targetPath);
  } catch (error) {
    setNotice(`Cannot reveal item: ${getErrorMessage(error)}`);
  }
}

