import { cookies } from "next/headers";
import { getChatGPTUser } from "./chatgpt-auth";
import { GUEST_COOKIE, guestOwner } from "@/lib/guest-access";
export async function getWorkspaceVisitor() {
  const account = await getChatGPTUser();
  if (account) return { userId: account.userId, guest: false };
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  const owner = token ? await guestOwner(token) : null;
  return owner ? { userId: owner, guest: true } : null;
}
