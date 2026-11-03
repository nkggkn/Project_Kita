import { MIME_LIMITS } from "./validation";

export type CaptureKind = "photo" | "video";
export function captureFileError(file: { type: string; size: number }, kind: CaptureKind) {
  const allowed = kind === "photo"
    ? ["image/jpeg", "image/png", "image/webp"]
    : ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
  if (!allowed.includes(file.type)) return kind === "photo" ? "Choose a JPG, PNG or WebP photo." : "Choose an MP4, WebM, MOV or AVI video.";
  if (!file.size || file.size > MIME_LIMITS[file.type]) return kind === "photo" ? "Choose a photo under 12 MB." : "Choose a video under 25 MB.";
  return "";
}
export function canContinueCapture(step: number, file: unknown, roomId: string, roomName: string, mediaId: string, hasReport: boolean) {
  if (step === 1) return !!file;
  if (step === 2) return !!file && (!!mediaId || !!roomId || !!roomName.trim());
  if (step === 3) return !!mediaId;
  return step === 4 && hasReport;
}
