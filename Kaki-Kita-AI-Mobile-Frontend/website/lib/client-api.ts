let visitorReady: Promise<void> | null = null;
async function ensureVisitor() {
  if (!visitorReady) visitorReady = fetch("/api/visitor", { method: "POST", credentials: "same-origin", cache: "no-store" }).then(response => {
    if (!response.ok) throw new Error("Could not open your workspace. Refresh the page and allow this site's cookies.");
  }).catch(error => { visitorReady = null; throw error; });
  return visitorReady;
}
export async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  await ensureVisitor();
  const response = await fetch(`/api${path}`, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => null) as { error?: string } | null;
  if (response.status === 401) throw new Error("Your workspace session has expired. Refresh the page and allow this site's cookies to continue.");
  if (!response.ok) throw new Error(data?.error || `The request failed (HTTP ${response.status}). Please try again.`);
  if (data === null && response.headers.get("content-type")?.includes("text/html")) throw new Error("The server returned a page instead of data. Refresh your session and retry.");
  return data as T;
}
