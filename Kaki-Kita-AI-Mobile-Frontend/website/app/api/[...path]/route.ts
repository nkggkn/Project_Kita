import { env } from "cloudflare:workers";
import { getWorkspaceVisitor } from "@/app/workspace-visitor";
import { apiBase, InputError, MIME_LIMITS, roomInput, validMagic } from "@/lib/validation";
import { analysisFailure, checkKitaHealth, networkReason, readAnalysis } from "@/lib/kita-api";
import { emptySafety, safetyInput } from "@/lib/safety";
import { filterServices, normalizeService, type CommunityService } from "@/lib/community";
import communityData from "@/data/community-services.json";
import { itemsFromReport, removalUpdate, MAX_REMOVAL_ITEMS, type RemovalItem } from "@/lib/removal-checklist";
import { claimAnalysis, claimPublicQuota } from "@/lib/public-quota";
import { BUILTIN_TRANSLATIONS, languageInput } from "@/lib/languages";
import { sha256 } from "@/lib/guest-access";
import { translateTexts } from "@/lib/caregiver-api";

export const dynamic = "force-dynamic";
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
type Media = { id: string; room_id: string; name: string; type: string; size: number; key: string; report_key: string | null; analyzed_at: string | null; created_at: string };
async function readBytes(request: Request, max: number) {
  if (Number(request.headers.get("content-length")) > max) throw new InputError("File is too large.", 413);
  if (!request.body) throw new InputError("File is empty.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) { await reader.cancel(); throw new InputError("File is too large.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new InputError("File is empty.");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
async function handler(request: Request) {
  try {
    const user = await getWorkspaceVisitor();
    if (!user) return json({ error: "Open the app to start your browser's workspace." }, 401);
    if (request.method !== "GET") {
      const origin = request.headers.get("origin");
      if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Cross-origin writes are not allowed." }, 403);
    }
    const db = env.DB, bucket = env.BUCKET;
    if (!db || !bucket) return json({ error: "Storage is not connected. Please try again after deployment." }, 503);
    const url = new URL(request.url);
    const p = url.pathname.split("/").filter(Boolean).slice(1);
    const method = request.method, owner = user.userId, now = new Date().toISOString();
    const configuredApi = async () => {
      const setting = await db.prepare("SELECT api_url FROM settings WHERE owner=?").bind(owner).first<{api_url: string}>();
      return setting?.api_url ?? env.KITA_API_BASE ?? "";
    };
    const ownRoom = async (id: string) => {
      const row = await db.prepare("SELECT * FROM rooms WHERE id=? AND owner=?").bind(id, owner).first();
      if (!row) throw new InputError("Room not found.", 404);
      return row;
    };
    const ownMedia = async (id: string) => {
      const row = await db.prepare("SELECT * FROM media WHERE id=? AND owner=?").bind(id, owner).first<Media>();
      if (!row) throw new InputError("File not found.", 404);
      return row;
    };
    if(p[0]==="translate" && p.length===1 && method==="POST") {
      let input:ReturnType<typeof languageInput>;
      try{input=languageInput(JSON.parse(new TextDecoder().decode(await readBytes(request,64000))));}
      catch{throw new InputError("Choose a language and a short text to translate.");}
      const result:string[]=[],missing:string[]=[],keys:string[]=[],positions:number[]=[];
      for(const [index,text] of input.texts.entries()) {
        const builtin=input.locale==="en"?text:BUILTIN_TRANSLATIONS[input.locale]?.[text];
        if(builtin){result[index]=builtin;continue;}
        const key=await sha256(owner+"\n"+input.locale+"\n"+text);
        const cached=await db.prepare("SELECT translated FROM translations WHERE id=? AND owner=?").bind(key,owner).first<{translated:string}>();
        if(cached){result[index]=cached.translated;continue;}
        keys.push(key);positions.push(index);missing.push(text);
      }
      if(missing.length) {
        const configured=await configuredApi();
        if(!configured)throw new InputError("Translation is not available. Try again later.",503);
        await claimPublicQuota(db,"translation:global",missing.join("").length,100000);
        await claimPublicQuota(db,`translation:${owner}`,missing.join("").length,20000);
        const translated=await translateTexts(apiBase(configured),input.locale,missing);
        await db.batch(translated.map((text,index)=>db.prepare("INSERT INTO translations(id,owner,locale,translated,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET translated=excluded.translated,created_at=excluded.created_at").bind(keys[index],owner,input.locale,text,now)));
        translated.forEach((text,index)=>{result[positions[index]]=text;});
        await db.prepare("DELETE FROM translations WHERE id IN (SELECT id FROM translations WHERE created_at<? LIMIT 100)").bind(new Date(Date.now()-7*86400000).toISOString()).run();
      }
      return json({translations:result});
    }
    type ChecklistRow = { media_id: string; room_id: string; items: string; sample_index: number; seconds: number | null; analyzed_at: string; updated_at: string; version: number; name: string; room_name: string; type: string };
    const listQuery = "SELECT c.*,m.name,m.type,m.room_id,r.name room_name FROM removal_checklists c JOIN media m ON m.id=c.media_id AND m.owner=c.owner JOIN rooms r ON r.id=m.room_id AND r.owner=c.owner WHERE c.owner=?";
    const checklistJson = (row: ChecklistRow) => ({ mediaId: row.media_id, roomId: row.room_id, name: row.name, roomName: row.room_name, mediaType: row.type, items: JSON.parse(row.items), sampleIndex: row.sample_index, seconds: row.seconds, analyzedAt: row.analyzed_at, updatedAt: row.updated_at, version: row.version });
    const readChecklist = async (id: string) => {
      const row = await db.prepare(listQuery + " AND c.media_id=?").bind(owner, id).first<ChecklistRow>();
      if (!row) throw new InputError("Checklist not found.", 404);
      return row;
    };
    if (p[0] === "checklists" && p.length === 1 && method === "GET") {
      const rows = await db.prepare(listQuery + " ORDER BY c.updated_at DESC LIMIT 100").bind(owner).all<ChecklistRow>();
      return json(rows.results.map(row => {
        const items = JSON.parse(row.items) as RemovalItem[];
        return { mediaId: row.media_id, name: row.name, roomName: row.room_name, total: items.length, done: items.filter(item => item.done).length, updatedAt: row.updated_at };
      }));
    }
    if (p[0] === "checklists" && p.length === 2) {
      const row = await readChecklist(p[1]);
      if (method === "GET") return json(checklistJson(row));
      if (method === "PUT") {
        const input = removalUpdate(JSON.parse(new TextDecoder().decode(await readBytes(request, 4096))));
        if (input.version !== row.version) throw new InputError("This checklist changed on another page. Reload it and try again.", 409);
        const items = JSON.parse(row.items) as RemovalItem[];
        if (input.action === "toggle") {
          const item = items.find(item => item.id === input.itemId);
          if (!item) throw new InputError("Checklist item not found.", 404);
          item.done = input.done;
        } else {
          if (items.length >= MAX_REMOVAL_ITEMS) throw new InputError("This checklist has reached its 500-item limit.");
          items.push({ id: crypto.randomUUID(), label: input.label, confidence: null, source: "manual", done: false });
        }
        const changed = await db.prepare("UPDATE removal_checklists SET items=?,updated_at=?,version=version+1 WHERE media_id=? AND owner=? AND version=?").bind(JSON.stringify(items), now, p[1], owner, row.version).run();
        if (!changed.meta.changes) throw new InputError("This checklist changed on another page. Reload it and try again.", 409);
        return json(checklistJson({ ...row, items: JSON.stringify(items), updated_at: now, version: row.version + 1 }));
      }
    }
    if (p[0] === "safety" && p.length === 1) {
      if (method === "GET") {
        const roomId = url.searchParams.get("room");
        if (roomId) await ownRoom(roomId);
        const review = await db.prepare("SELECT location,checks,updated_at FROM safety_reviews WHERE owner=? AND scope=?").bind(owner, roomId || "workspace").first<{location: string; checks: string; updated_at: string}>();
        return json(review ? { roomId, location: review.location, checks: JSON.parse(review.checks), updatedAt: review.updated_at } : { roomId, location: "", checks: emptySafety(), updatedAt: null });
      }
      if (method === "PUT") {
        const input = safetyInput(await request.json());
        if (input.roomId) await ownRoom(input.roomId);
        await db.prepare("INSERT INTO safety_reviews(owner,scope,location,checks,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner,scope) DO UPDATE SET location=excluded.location,checks=excluded.checks,updated_at=excluded.updated_at").bind(owner, input.roomId || "workspace", input.location, JSON.stringify(input.checks), now).run();
        return json({ ...input, updatedAt: now });
      }
    }
    if (p[0] === "services" && p.length === 1 && method === "GET") {
      const search = url.searchParams.get("q") || "", postal = url.searchParams.get("postal") || "", category = url.searchParams.get("category") || "";
      const offset = Number(url.searchParams.get("offset") || 0), limit = 24;
      if (search.length > 100 || !/^\d{0,6}$/.test(postal) || !["", "social", "eldercare", "other"].includes(category) || !Number.isSafeInteger(offset) || offset < 0) throw new InputError("Invalid directory search.");
      let rows = communityData.services as CommunityService[], totalAvailable = rows.length;
      const source = url.searchParams.get("source") || "official";
      if (!["official", "notebook"].includes(source)) throw new InputError("Invalid directory source.");
      if (source === "notebook") {
        const configured = await configuredApi();
        if (!configured) throw new InputError("Connect your notebook API in Settings to use uploaded GeoJSON.", 409);
        const base = apiBase(configured);
        let response: Response;
        try { response = await fetch(base + "/services?limit=500", { redirect: "manual", signal: AbortSignal.timeout(30000), headers: { "ngrok-skip-browser-warning": "1" } }); }
        catch (error) { throw new InputError(`Could not reach the notebook directory. ${networkReason(error)} You can use the official data snapshot instead.`, 502); }
        const data = await response.json().catch(() => null) as {success?: boolean; services?: any[]; total_matches?: number} | null;
        if (!response.ok || data?.success !== true || !Array.isArray(data.services)) throw new InputError("The notebook did not return a valid service directory.", 502);
        rows = data.services.map((record, i) => normalizeService(record, i));
        totalAvailable = Number(data.total_matches) || rows.length;
      }
      const matches = filterServices(rows, search, postal, category);
      return json({ services: matches.slice(offset, offset + limit), total: matches.length, loaded: rows.length, totalAvailable, hasMore: offset + limit < matches.length, source, retrievedAt: source === "official" ? communityData.retrievedAt : null, sources: communityData.sources });
    }
    if (p[0] === "health" && p.length === 1 && method === "GET") {
      const configured = await configuredApi();
      if (!configured) throw new InputError("Connect your notebook API in Settings first.", 409);
      return json(await checkKitaHealth(apiBase(configured)));
    }
    if (p[0] === "settings" && p.length === 1) {
      if (method === "GET") {
        if (user.guest) return json({ apiUrl: "", apiConfigured: !!await configuredApi(), suggestedApiUrl: "" });
        return json({ apiUrl: await configuredApi(), suggestedApiUrl: env.KITA_API_BASE || "" });
      }
      if (method === "PUT") {
        if (user.guest) throw new InputError("The public AI connection is managed by the website owner.", 403);
        const input = await request.json() as { apiUrl: unknown };
        const base = apiBase(input.apiUrl);
        if (base) await checkKitaHealth(base);
        await db.prepare("INSERT INTO settings(owner,api_url) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET api_url=excluded.api_url").bind(owner, base).run();
        return json({ apiUrl: base });
      }
    }
    if (p[0] === "rooms" && p.length === 1) {
      if (method === "GET") {
        const result = await db.prepare(`SELECT r.*, (SELECT COUNT(*) FROM media m WHERE m.room_id=r.id AND m.owner=r.owner) media_count,
          (SELECT COUNT(*) FROM media m WHERE m.room_id=r.id AND m.owner=r.owner AND m.analyzed_at IS NOT NULL) report_count,
          (SELECT id FROM media m WHERE m.room_id=r.id AND m.owner=r.owner AND m.type LIKE 'image/%' ORDER BY m.created_at LIMIT 1) cover_id
          FROM rooms r WHERE r.owner=? ORDER BY r.updated_at DESC`).bind(owner).all();
        return json(result.results);
      }
      if (method === "POST") {
        const v = roomInput(await request.json());
        if (user.guest) {
          const count = await db.prepare("SELECT COUNT(*) count FROM rooms WHERE owner=?").bind(owner).first<{count: number}>();
          if ((count?.count || 0) >= 10) throw new InputError("This browser already has 10 rooms. Choose an existing room for your next input.", 429);
        }
        await claimPublicQuota(db, "rooms:global", 1, 100);
        const id = crypto.randomUUID();
        await db.prepare("INSERT INTO rooms(id,owner,name,type,location,area,notes,checklist,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id, owner, v.name, v.type, v.location, v.area, v.notes, v.checklist, now, now).run();
        return json({ id }, 201);
      }
    }
    if (p[0] === "rooms" && p[1]) {
      const room = await ownRoom(p[1]);
      if (p.length === 2 && method === "GET") {
        const media = await db.prepare("SELECT id,room_id,name,type,size,analyzed_at,created_at FROM media WHERE room_id=? AND owner=? ORDER BY created_at").bind(p[1], owner).all();
        return json({ ...room, media: media.results });
      }
      if (p.length === 2 && method === "PUT") {
        const v = roomInput(await request.json());
        await db.prepare("UPDATE rooms SET name=?,type=?,location=?,area=?,notes=?,checklist=?,updated_at=? WHERE id=? AND owner=?").bind(v.name, v.type, v.location, v.area, v.notes, v.checklist, now, p[1], owner).run();
        return json({ success: true });
      }
      if (p.length === 3 && p[2] === "media" && method === "POST") {
        const type = request.headers.get("content-type") || "";
        const limit = MIME_LIMITS[type];
        if (!limit) throw new InputError("Use JPG, PNG, WebP, MP4, WebM, MOV or AVI.", 415);
        const name = url.searchParams.get("name")?.trim();
        if (!name || name.length > 200) throw new InputError("Invalid filename.");
        const bytes = await readBytes(request, limit);
        if (!validMagic(bytes, type)) throw new InputError("The file contents do not match its format.", 415);
        await claimPublicQuota(db, "uploads:global", bytes.length, 200 * 1024 * 1024);
        await claimPublicQuota(db, `uploads:visitor:${owner}`, bytes.length, 50 * 1024 * 1024);
        const id = crypto.randomUUID(), key = `uploads/${id}`;
        await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
        try {
          await db.batch([
            db.prepare("INSERT INTO media(id,owner,room_id,name,type,size,key,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id, owner, p[1], name, type, bytes.length, key, now),
            db.prepare("UPDATE rooms SET updated_at=? WHERE id=? AND owner=?").bind(now, p[1], owner),
          ]);
        } catch (error) { await bucket.delete(key); throw error; }
        return json({ id }, 201);
      }
    }
    if (p[0] === "media" && p[1]) {
      const media = await ownMedia(p[1]);
      if (p[2] === "checklist" && p.length === 3 && method === "GET") {
        const existing = await db.prepare(listQuery + " AND c.media_id=?").bind(owner, media.id).first<ChecklistRow>();
        return json(existing ? checklistJson(existing) : null);
      }
      if (p[2] === "checklist" && p.length === 3 && method === "POST") {
        const existing = await db.prepare(listQuery + " AND c.media_id=?").bind(owner, media.id).first<ChecklistRow>();
        if (existing) return json(checklistJson(existing));
        if (!media.report_key) throw new InputError("Analyze this photo or video first to find its objects.", 409);
        const saved = await bucket.get(media.report_key);
        if (!saved) throw new InputError("The saved analysis is missing. Analyze this file again.", 404);
        const draft = itemsFromReport(await saved.json());
        await db.prepare("INSERT INTO removal_checklists(media_id,owner,items,sample_index,seconds,analyzed_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(media_id) DO NOTHING").bind(media.id, owner, JSON.stringify(draft.items), draft.sampleIndex, draft.seconds, draft.analyzedAt, now).run();
        return json(checklistJson(await readChecklist(media.id)), 201);
      }
      if (p.length === 2 && method === "DELETE") {
        const clean=await db.prepare("SELECT preview_key FROM clean_previews WHERE media_id=? AND owner=?").bind(media.id,owner).first<{preview_key:string|null}>();
        await bucket.delete([media.key, ...(media.report_key ? [media.report_key] : []), ...(clean?.preview_key?[clean.preview_key]:[])]);
        await db.prepare("DELETE FROM media WHERE id=? AND owner=?").bind(media.id, owner).run();
        return json({ success: true });
      }
      if (p[2] === "file" && p.length === 3 && method === "GET") {
        const head = await bucket.head(media.key);
        if (!head) throw new InputError("Stored file is missing.", 404);
        const headers = new Headers({ "Content-Type": media.type, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
        const range = request.headers.get("range");
        let offset = 0, end = head.size - 1;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${head.size}` } });
          if (!match[1]) offset = Math.max(0, head.size - Number(match[2]));
          else { offset = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
          if (offset > end || offset < 0) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${head.size}` } });
          headers.set("Content-Range", `bytes ${offset}-${end}/${head.size}`);
        }
        const file = await bucket.get(media.key, range ? { range: { offset, length: end - offset + 1 } } : undefined);
        if (!file) throw new InputError("File not found.", 404);
        headers.set("Content-Length", String(end - offset + 1));
        return new Response(file.body, { status: range ? 206 : 200, headers });
      }
      if (p[2] === "report" && p.length === 3 && method === "GET") {
        if (!media.report_key) return json(null);
        const report = await bucket.get(media.report_key);
        if (!report) throw new InputError("Report not found.", 404);
        return new Response(report.body, { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
      }
      if (p[2] === "analyze" && p.length === 3 && method === "POST") {
        const configured = await configuredApi();
        if (!configured) throw new InputError("Connect your Kita Vision API in Settings first.", 409);
        const base = apiBase(configured);
        const inputs: { blob: Blob; seconds: number | null }[] = [];
        if (media.type.startsWith("image/")) {
          const file = await bucket.get(media.key);
          if (!file) throw new InputError("Stored file is missing.", 404);
          inputs.push({ blob: new Blob([await file.arrayBuffer()], { type: media.type }), seconds: null });
        } else {
          const bytes = await readBytes(request, 12 * 1024 * 1024);
          const form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
          const frames = form.getAll("frames");
          const times = JSON.parse(String(form.get("times"))) as number[];
          if (frames.length !== 3 || !Array.isArray(times) || times.length !== 3 || !times.every(t => Number.isFinite(t) && t >= 0)) throw new InputError("Three valid video frames are required.");
          for (let i = 0; i < frames.length; i++) {
            const f = frames[i];
            if (typeof f === "string" || f.type !== "image/jpeg" || !validMagic(new Uint8Array(await f.arrayBuffer()), f.type)) throw new InputError("Invalid video frame.");
            inputs.push({ blob: f, seconds: times[i] });
          }
        }
        await claimAnalysis(db, request, owner, inputs.length);
        const samples = [];
        for (const input of inputs) {
          const form = new FormData(); form.append("file", input.blob, "room.jpg");
          let response: Response;
          try { response = await fetch(base + "/detect", { method: "POST", body: form, redirect: "manual", signal: AbortSignal.timeout(240000), headers: { "ngrok-skip-browser-warning": "1" } }); }
          catch (error) { throw new InputError(`The website could not reach the analysis API. ${networkReason(error)} Your saved files and previous report are unchanged.`, 502); }
          const result = await response.json().catch(() => null) as Record<string, any> | null;
          if (!response.ok) throw new InputError(analysisFailure(response.status, result?.detail), 502);
          if (result?.success !== true || !Array.isArray(result.yolo?.detections) || !result.yolo.detections.every((d: any) => typeof d.label === "string" && typeof d.confidence === "number" && Number.isFinite(d.confidence) && d.confidence >= 0 && d.confidence <= 1 && (d.confidence_percent == null || typeof d.confidence_percent === "number" && Number.isFinite(d.confidence_percent)))) throw new InputError("The API responded, but the report format did not match the Kita Vision notebook. Check that this is the correct API address.", 502);
          samples.push({ seconds: input.seconds, result: { ...result, analysis: readAnalysis(result) } });
        }
        const report = { analyzedAt: now, kind: media.type.startsWith("video/") ? "video" : "image", samples };
        const key = `reports/${crypto.randomUUID()}.json`;
        await bucket.put(key, JSON.stringify(report), { httpMetadata: { contentType: "application/json" } });
        try { await db.prepare("UPDATE media SET report_key=?,analyzed_at=? WHERE id=? AND owner=?").bind(key, now, media.id, owner).run(); }
        catch (error) { await bucket.delete(key); throw error; }
        if (media.report_key) await bucket.delete(media.report_key);
        return json(report);
      }
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    if (error instanceof InputError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: "Invalid request data." }, 400);
    console.error("Room library request failed", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Something went wrong. Please try again. Your saved records have not been reset." }, 500);
  }
}
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
