import { notFound } from "next/navigation";
import { getChatGPTUser } from "../chatgpt-auth";
import RoomLibrary from "../room-library";
export const dynamic = "force-dynamic";
export default async function Section({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!["vision", "watch", "safety", "kopi", "about", "library", "reports", "settings"].includes(section)) notFound();
  const user = await getChatGPTUser();
  return <RoomLibrary displayName={user?.displayName || "Guest"} guest={!user} initialView={section} />;
}
