import { InputError } from "./validation";

export type RemovalItem = { id: string; label: string; confidence: number | null; source: "detected" | "manual"; done: boolean };
export type RemovalList = {
  mediaId: string; roomId: string; name: string; roomName: string; mediaType: string;
  items: RemovalItem[]; sampleIndex: number; seconds: number | null;
  analyzedAt: string; updatedAt: string; version: number;
};
const excluded = new Set(["person", "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"]);
export const MAX_REMOVAL_ITEMS = 500;

export function itemsFromReport(report: unknown) {
  const data = report as { analyzedAt?: unknown; samples?: { seconds?: unknown; result?: { yolo?: { detections?: unknown } } }[] } | null;
  if (!data || typeof data.analyzedAt !== "string" || !Array.isArray(data.samples) || !data.samples.length || data.samples.length > 3) throw new InputError("This saved report cannot be used as a checklist. Analyze the file again.", 422);
  const frames = data.samples.map((sample, sampleIndex) => {
    const detections = sample?.result?.yolo?.detections;
    if (!Array.isArray(detections) || detections.length > MAX_REMOVAL_ITEMS) throw new InputError("The report contains invalid object detections.", 422);
    const objects = detections.map((d: unknown) => {
      const item = d as { label?: unknown; confidence?: unknown } | null;
      if (!item || typeof item.label !== "string" || !item.label.trim() || item.label.length > 100 || typeof item.confidence !== "number" || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) throw new InputError("The report contains invalid object detections.", 422);
      return { label: item.label.trim().toLowerCase(), confidence: item.confidence };
    }).filter(d => !excluded.has(d.label));
    return { objects, sampleIndex, seconds: typeof sample.seconds === "number" && Number.isFinite(sample.seconds) && sample.seconds >= 0 ? sample.seconds : null };
  });
  // A single frame avoids counting the same object in three video samples as three items.
  const frame = frames.reduce((best, next) => next.objects.length > best.objects.length ? next : best);
  const totals = new Map<string, number>(), counts = new Map<string, number>();
  for (const object of frame.objects) totals.set(object.label, (totals.get(object.label) || 0) + 1);
  const items: RemovalItem[] = frame.objects.map((object, index) => {
    const ordinal = (counts.get(object.label) || 0) + 1;
    counts.set(object.label, ordinal);
    const label = object.label[0].toUpperCase() + object.label.slice(1);
    return { id: `detected-${frame.sampleIndex}-${index}`, label: label + (totals.get(object.label)! > 1 ? ` ${ordinal}` : ""), confidence: object.confidence, source: "detected", done: false };
  });
  return { items, sampleIndex: frame.sampleIndex, seconds: frame.seconds, analyzedAt: data.analyzedAt };
}

export function removalUpdate(value: unknown) {
  const data = value as Record<string, unknown> | null;
  if (!data || !Number.isSafeInteger(data.version) || Number(data.version) < 1) throw new InputError("Reload this checklist before changing it.");
  if (data.action === "toggle" && typeof data.itemId === "string" && data.itemId.length <= 100 && typeof data.done === "boolean") return { action: "toggle" as const, itemId: data.itemId, done: data.done, version: Number(data.version) };
  if (data.action === "add" && typeof data.label === "string" && data.label.trim() && data.label.length <= 100) return { action: "add" as const, label: data.label.trim(), version: Number(data.version) };
  throw new InputError("Choose a checklist item, or enter an item name up to 100 characters.");
}
