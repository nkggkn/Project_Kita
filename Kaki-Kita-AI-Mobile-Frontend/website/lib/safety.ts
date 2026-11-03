import { InputError } from "./validation";
export const SAFETY_CHECKS = [
  { title: "Walkway clearance", question: "Are walkways wide and clear enough for people to pass comfortably?" },
  { title: "Potential obstructions", question: "Are there objects, bikes, boxes or items that may block movement?" },
  { title: "Emergency exits and access", question: "Are exits, stairwells and access routes visible and unobstructed?" },
  { title: "Mobility aid accessibility", question: "Can wheelchairs, walkers and other mobility aids move through the space?" },
  { title: "Trip and slip concerns", question: "Are there uneven surfaces, cables, wet floors or loose mats?" },
  { title: "Human verification and follow-up", question: "Has a person checked the space in person and noted any follow-up needed?" },
];
export const SAFETY_STATUSES = ["Not reviewed", "Reviewed", "Follow-up required"];
export type SafetyItem = { status: string; notes: string };
export const emptySafety = (): SafetyItem[] => SAFETY_CHECKS.map(() => ({ status: "Not reviewed", notes: "" }));
export function safetyInput(value: Record<string, unknown>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Invalid safety review.");
  if (typeof value.location !== "string" || value.location.length > 200) throw new InputError("Location must be under 200 characters.");
  if (value.roomId !== null && (typeof value.roomId !== "string" || value.roomId.length > 100)) throw new InputError("Invalid room.");
  if (!Array.isArray(value.checks) || value.checks.length !== SAFETY_CHECKS.length) throw new InputError("All six review items are required.");
  const checks = value.checks.map(v => {
    if (!v || typeof v !== "object" || !SAFETY_STATUSES.includes(v.status) || typeof v.notes !== "string" || v.notes.length > 2000) throw new InputError("Invalid review status or notes.");
    return { status: v.status as string, notes: v.notes.trim() as string };
  });
  return { roomId: value.roomId as string | null, location: value.location.trim(), checks };
}
