export const DATA_SOURCES = [
  { id: "d_736e30b5a0111242dfde98d7b32cfda2", name: "Social Service Agencies", category: "social", agency: "Ministry of Social and Family Development (MSF)" },
  { id: "d_f0fd1b3643ed8bd34bd403dedd7c1533", name: "Eldercare Services", category: "eldercare", agency: "Ministry of Health (MOH)" },
] as const;
export type CommunityService = { id: string; name: string | null; address: string | null; postal: string | null; website: string | null; description: string | null; category: string; source: string; sourceUrl: string | null; coordinates: [number, number] | null };
function plain(value: unknown): string {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#(?:0*39|x0*27);/gi, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => { const code = Number(n); return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""; }).replace(/\s+/g, " ").trim();
}
export function normalizeService(record: { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown }; source_file?: string }, index: number, category?: string, sourceId?: string): CommunityService {
  const p = record.properties || {}, attributes: Record<string, string> = {};
  const html = String(p.Description || "");
  for (const match of html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi)) attributes[plain(match[1]).toUpperCase()] = plain(match[2]);
  for (const [key, value] of Object.entries(p)) if (key !== "Description" && key !== "Name") attributes[key.toUpperCase()] = plain(value);
  const get = (...keys: string[]) => keys.map(k => attributes[k]).find(v => v && v !== "null" && v !== "undefined") || null;
  const name = get("NAME", "AGENCY_NAME", "SERVICE_NAME") || (p.Name && !/^kml_\d+$/i.test(String(p.Name)) ? plain(p.Name) : null);
  const floor = get("ADDRESSFLOORNUMBER"), unit = get("ADDRESSUNITNUMBER");
  const address = get("ADDRESS") || [get("ADDRESSBLOCKHOUSENUMBER"), get("ADDRESSSTREETNAME"), get("ADDRESSBUILDINGNAME"), floor ? `#${floor}${unit ? `-${unit}` : ""}` : unit].filter(Boolean).join(" ") || null;
  const rawPostal = get("ADDRESSPOSTALCODE", "POSTAL_CODE", "POSTALCODE");
  const postal = rawPostal && /^\d{1,6}$/.test(rawPostal) ? rawPostal.padStart(6, "0") : rawPostal;
  let website = get("HYPERLINK", "WEBSITE", "URL");
  if (website) { try { const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`); website = ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && url.hostname.includes(".") ? url.href : null; } catch { website = null; } }
  const coords = record.geometry?.coordinates;
  const coordinates: [number, number] | null = record.geometry?.type === "Point" && Array.isArray(coords) && typeof coords[0] === "number" && typeof coords[1] === "number" && Math.abs(coords[0]) <= 180 && Math.abs(coords[1]) <= 90 ? [coords[0], coords[1]] : null;
  const source = record.source_file || (sourceId ? DATA_SOURCES.find(s => s.id === sourceId)?.name : null) || "Notebook GeoJSON";
  const detectedCategory = category || (/elder/i.test(source) ? "eldercare" : /social|welfare/i.test(source) ? "social" : "other");
  return { id: `${sourceId || source}-${get("OBJECTID") || index}`, name, address, postal, website, description: get("DESCRIPTION"), category: detectedCategory, source, sourceUrl: sourceId ? `https://data.gov.sg/datasets/${sourceId}/view` : null, coordinates };
}
export function filterServices(rows: CommunityService[], search: string, postal: string, category: string) {
  const term = search.trim().toLocaleLowerCase();
  return rows.filter(r => (!category || r.category === category) && (!postal || r.postal?.includes(postal)) && (!term || `${r.name || ""} ${r.address || ""} ${r.description || ""}`.toLocaleLowerCase().includes(term)));
}
