export const TYPES = ["Living room", "Bedroom", "Kitchen", "Bathroom", "Hallway", "Office", "Other"];
export const CHECKS = ["Entrance and doorway", "Walking space", "Floor and surfaces", "Lighting", "Furniture placement"];
export const MIME_LIMITS: Record<string, number> = {
  "image/jpeg": 12 * 1024 * 1024, "image/png": 12 * 1024 * 1024,
  "image/webp": 12 * 1024 * 1024, "video/mp4": 25 * 1024 * 1024,
  "video/webm": 25 * 1024 * 1024,
  "video/quicktime": 25 * 1024 * 1024, "video/x-msvideo": 25 * 1024 * 1024,
};
export class InputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function roomInput(v: Record<string, unknown>) {
  const string = (key: string, max: number) => {
    if (typeof v[key] !== "string" || (v[key] as string).length > max) throw new InputError(`Invalid ${key}.`);
    return (v[key] as string).trim();
  };
  const name = string("name", 100);
  if (!name) throw new InputError("Give your room a name.");
  const type = string("type", 30);
  if (!TYPES.includes(type)) throw new InputError("Choose a room type.");
  const area = v.area === "" || v.area == null ? null : Number(v.area);
  if (area !== null && (!Number.isFinite(area) || area <= 0 || area > 100000)) throw new InputError("Area must be between 0 and 100,000 m².");
  const checklist = v.checklist;
  if (!Array.isArray(checklist) || checklist.length !== CHECKS.length || !checklist.every(x => ["Not checked", "Looks clear", "Needs review"].includes(x))) throw new InputError("Invalid room checks.");
  return { name, type, area, location: string("location", 200), notes: string("notes", 5000), checklist: JSON.stringify(checklist) };
}
export function apiBase(value: unknown) {
  if (value === "") return "";
  if (typeof value !== "string" || value.length > 500) throw new InputError("Enter a valid HTTPS API address.");
  let u: URL;
  try { u = new URL(value); } catch { throw new InputError("Enter a valid HTTPS API address."); }
  const h = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.search || u.hash || !/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(h) || /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(h) || h.endsWith(".lovable.dev") || h === "lovable.dev") throw new InputError("Use your public HTTPS Kita API address, not a Lovable editor link or local address.");
  return value.replace(/\/+$/, "");
}
export function validMagic(bytes: Uint8Array, type: string) {
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png") return bytes[0] === 137 && ascii(1, 4) === "PNG";
  if (type === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (type === "video/mp4" || type === "video/quicktime") return ascii(4, 8) === "ftyp";
  if (type === "video/x-msvideo") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "AVI ";
  if (type === "video/webm") return bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163;
  return false;
}
