import { getChatGPTUser } from "./chatgpt-auth";
import RoomLibrary from "./room-library";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getChatGPTUser();
  return <RoomLibrary displayName={user?.displayName || "Guest"} guest={!user} />;
}
