import { InputError } from "./validation";
import { sha256 } from "./guest-access";
export async function claimPublicQuota(db: D1Database, scope: string, amount: number, limit: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > limit) throw new InputError("Invalid public allowance request.");
  const day = new Date().toISOString().slice(0, 10);
  const expires = Math.floor(Date.now() / 1000) + 31 * 86400;
  // The conditional upsert enforces the cap even when requests arrive together.
  const row = await db.prepare("INSERT INTO public_usage(key,used,expires_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET used=used+excluded.used WHERE used+excluded.used<=? RETURNING used").bind(`${day}:${scope}`, amount, expires, limit).first();
  if (!row) throw new InputError("Today's public allowance has been reached. Saved checklists still work. Please try again after 00:00 UTC.", 429);
  await db.prepare("DELETE FROM public_usage WHERE key IN (SELECT key FROM public_usage WHERE expires_at<? LIMIT 100)").bind(Math.floor(Date.now() / 1000)).run();
}
export async function claimAnalysis(db: D1Database, request: Request, owner: string, frames: number) {
  if (frames !== 1 && frames !== 3) throw new InputError("Choose a photo or three video frames.");
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const budgets = [
    { key: `${day}:analysis:visitor:${owner}`, limit: 25, message: "Your workspace has used its 25 image checks today." },
    { key: `${day}:analysis:network:${await sha256(ip)}`, limit: 50, message: "This network has used its 50 image checks today." },
    { key: `${day}:analysis:global`, limit: 100, message: "The website has used its 100 shared image checks today." },
  ];
  // One statement reserves all budgets or none, including when requests race.
  const result = await db.prepare(`
    WITH budgets(key,cap) AS (VALUES (?,?),(?,?),(?,?)),
    gate AS MATERIALIZED (
      SELECT NOT EXISTS (
        SELECT 1 FROM budgets b JOIN public_usage u ON u.key=b.key WHERE u.used+?>b.cap
      ) AS allowed
    )
    INSERT INTO public_usage(key,used,expires_at)
    SELECT budgets.key,?,? FROM budgets CROSS JOIN gate WHERE gate.allowed
    ON CONFLICT(key) DO UPDATE SET used=public_usage.used+excluded.used
    RETURNING key,used
  `).bind(...budgets.flatMap(budget => [budget.key, budget.limit]), frames, frames, Math.floor(Date.now()/1000)+31*86400).all<{key:string;used:number}>();
  if (!result.results.length) {
    const current = await db.prepare("SELECT key,used FROM public_usage WHERE key IN (?,?,?)").bind(...budgets.map(budget => budget.key)).all<{key:string;used:number}>();
    const blocked = budgets.find(budget => (current.results.find(row => row.key===budget.key)?.used || 0)+frames>budget.limit);
    throw new InputError(`${blocked?.message || "Today's scanning limit has been reached."} Please try again after 8:00 AM Singapore time (00:00 UTC). A video uses 3 checks. Saved results and checklists still work.`,429);
  }
  if (result.results.length !== budgets.length) throw new InputError("Could not reserve the image check. Please try again.",503);
  // Forwarded failures count too; blocked requests above consume no allowance.
  await db.prepare("DELETE FROM public_usage WHERE key IN (SELECT key FROM public_usage WHERE expires_at<? LIMIT 100)").bind(Math.floor(Date.now()/1000)).run().catch(()=>{});
}
