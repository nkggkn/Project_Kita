export const TOUR_STORAGE_KEY = "kaki-kita-tour-v1";
export function tiltAt(x: number, y: number, width: number, height: number) {
  const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
  const px = width > 0 ? clamp(x / width) : 0.5, py = height > 0 ? clamp(y / height) : 0.5;
  return { rotateX: (0.5 - py) * 10, rotateY: (px - 0.5) * 10, glareX: px * 100, glareY: py * 100 };
}
export type TourRect = { top: number; left: number; width: number; height: number };
export function placeTour(viewport: { width: number; height: number }, target: TourRect | null, card: { width: number; height: number }) {
  const gap = 20, margin = 16;
  const width = Math.min(card.width, Math.max(0, viewport.width - margin * 2));
  const height = Math.min(card.height, Math.max(0, viewport.height - margin * 2));
  const clampX = (x: number) => Math.max(margin, Math.min(x, viewport.width - width - margin));
  const clampY = (y: number) => Math.max(margin, Math.min(y, viewport.height - height - margin));
  if (!target) return { left: clampX((viewport.width - width) / 2), top: clampY((viewport.height - height) / 2) };
  const right = target.left + target.width, bottom = target.top + target.height;
  if (viewport.width >= 760 && viewport.width - right >= width + gap + margin) return { left: clampX(right + gap), top: clampY(target.top) };
  if (viewport.width >= 760 && target.left >= width + gap + margin) return { left: clampX(target.left - width - gap), top: clampY(target.top) };
  if (viewport.height - bottom >= height + gap + margin) return { left: clampX(target.left), top: clampY(bottom + gap) };
  if (target.top >= height + gap + margin) return { left: clampX(target.left), top: clampY(target.top - height - gap) };
  return { left: clampX(viewport.width - width - margin), top: clampY(viewport.height - height - margin) };
}
export function starterSteps(roomCount: number, files: number, connected: boolean, reports: number) {
  return [
    { title: "Make a room", detail: "Give your space a name", view: "library", done: roomCount > 0 },
    { title: "Add a perspective", detail: "Save a photo or video", view: "vision", done: files > 0 },
    { title: "Connect your AI", detail: "Configure the notebook API", view: "settings", done: connected },
    { title: "Look a little closer", detail: "Create your first report", view: reports ? "reports" : "library", done: reports > 0 },
  ];
}
