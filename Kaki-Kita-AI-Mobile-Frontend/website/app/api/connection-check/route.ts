import { apiBase, InputError } from "@/lib/validation";
import { checkKitaHealth } from "@/lib/kita-api";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";
// The Site is public; an anonymous caller must not use this as an arbitrary URL proxy.
export async function GET(request: Request) {
  if (!await getChatGPTUser()) return Response.json({ error: "Sign in to use the connection diagnostic." }, { status: 401 });
  try {
    const base = apiBase(new URL(request.url).searchParams.get("url"));
    const health = await checkKitaHealth(base);
    return Response.json({ ok: true, health }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof InputError ? error.message : "Connection diagnostic failed." }, { status: error instanceof InputError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
