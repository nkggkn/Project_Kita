export const GUEST_COOKIE = "kita_guest";
export const GUEST_MAX_AGE = 180 * 24 * 60 * 60;
export function validGuestToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function newGuestToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function guestOwner(token: string) {
  if (!validGuestToken(token)) return null;
  return "guest:" + await sha256(token);
}
