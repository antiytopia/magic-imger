export function formatMeta(width: number, height: number, format: string, fileSizeBytes: number): string {
  return `${width}x${height} | ${format} | ${(fileSizeBytes / 1024).toFixed(1)} KB`;
}

