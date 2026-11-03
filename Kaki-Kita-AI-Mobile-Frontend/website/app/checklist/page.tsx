import type { Metadata, Viewport } from "next";
import { getChatGPTUser } from "../chatgpt-auth";
import RemovalApp from "./removal-app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kita Clear | Kaki Kita AI", description: "Turn room photos and videos into a simple item-by-item removal checklist.", manifest: "/checklist.webmanifest", appleWebApp: { capable: true, title: "Kita Clear", statusBarStyle: "default" } };
export const viewport: Viewport = { themeColor: "#2258a6" };
export default async function ChecklistPage() {
  const account = await getChatGPTUser();
  return <RemovalApp guest={!account} />;
}
