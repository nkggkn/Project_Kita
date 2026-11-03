import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../lib/community.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { DATA_SOURCES, normalizeService } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const rows = [], sources = [];
for (const data of DATA_SOURCES) {
  const response = await fetch(`https://api-open.data.gov.sg/v1/public/api/datasets/${data.id}/poll-download`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Dataset metadata HTTP ${response.status}`);
  const poll = await response.json();
  if (!poll.data?.url) throw new Error(`Download not ready: ${data.name}`);
  const url = new URL(poll.data.url);
  if (url.protocol !== "https:") throw new Error("Invalid data download URL");
  const download = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!download.ok) throw new Error(`Dataset download HTTP ${download.status}`);
  const geo = await download.json();
  if (geo.type !== "FeatureCollection" || !Array.isArray(geo.features)) throw new Error("Invalid GeoJSON");
  const records = geo.features.map((feature, index) => normalizeService(feature, index, data.category, data.id));
  rows.push(...records); sources.push({ ...data, count: records.length, url: `https://data.gov.sg/datasets/${data.id}/view` });
  console.log(`${data.name}: ${records.length} records`);
}
mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
writeFileSync(new URL("../data/community-services.json", import.meta.url), JSON.stringify({ retrievedAt: new Date().toISOString(), sources, services: rows }, null, 2) + "\n");
console.log(`Saved ${rows.length} official records. Missing fields remain null.`);
