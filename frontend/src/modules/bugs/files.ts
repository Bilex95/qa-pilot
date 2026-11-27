/** Attachment limits (D-009), checked here for a quick answer; the API checks again and its answer wins. */
export const MAX_FILES = 10;
export const MAX_FILE_MB = 10;
export const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "pdf", "txt", "log", "json", "csv", "zip", "mp4", "webm"] as const;

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** The message to show when the file cannot be attached, or null when it can. */
export function checkFile(file: { name: string; size: number }, countNow: number): string | null {
  if (countNow >= MAX_FILES) return `A bug holds at most ${MAX_FILES} files. Remove one first.`;
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) {
    return "That file type is not allowed. Use an image, PDF, text, log, JSON, CSV, ZIP or video file.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `That file is larger than ${MAX_FILE_MB} MB.`;
  return null;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
