import { getChatGPTUser } from "@/app/chatgpt-auth";
import { cookies } from "next/headers";
import { GUEST_COOKIE, GUEST_MAX_AGE, newGuestToken, validGuestToken } from "@/lib/guest-access";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
  const headers = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  if (await getChatGPTUser()) return Response.json({ guest: false }, { headers });
  const previous = (await cookies()).get(GUEST_COOKIE)?.value;
  const token = validGuestToken(previous) ? previous : newGuestToken();
  // The opaque cookie owns only this browser's guest records, never a signed-in account.
  headers.set("Set-Cookie", `${GUEST_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${GUEST_MAX_AGE}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`);
  return Response.json({ guest: true }, { headers });
}
