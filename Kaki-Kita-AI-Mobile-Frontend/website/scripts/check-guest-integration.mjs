// Run against the built local Worker. No external API calls or production data.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:8787';
const asJson=body=>({headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function call(path,init={},cookie='') {return fetch(base+path,{...init,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...init.headers}});}
function localDb(command) {return execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',command],{encoding:'utf8'});}
const quota=new Date().toISOString().slice(0,10)+':rooms:global';
localDb(`UPDATE public_usage SET used=3 WHERE key='${quota}'`);
const page=await call('/checklist');assert.equal(page.status,200);assert((await page.text()).includes('Kita Clear'));
for (const path of ['/', '/library', '/vision', '/watch', '/safety', '/kopi', '/reports', '/settings', '/about']) {
  const response=await call(path);assert.equal(response.status,200,`${path} must open without a ChatGPT account`);
  assert((await response.text()).includes('Photos and tasks stay together.'));
}
assert.equal((await call('/api/rooms')).status,401);
assert.equal((await call('/api/visitor',{method:'POST',headers:{Origin:'https://evil.test'}})).status,403);
assert.equal((await call('/api/visitor',{method:'POST',headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
const first=await call('/api/visitor',{method:'POST'});assert.deepEqual(await first.json(),{guest:true});
const raw=first.headers.get('set-cookie');assert(raw.includes('HttpOnly'));assert(raw.includes('SameSite=Lax'));
const a=raw.split(';')[0];
const second=await call('/api/visitor',{method:'POST'});const b=second.headers.get('set-cookie').split(';')[0];assert.notEqual(a,b);
const again=await call('/api/visitor',{method:'POST'},a);assert.equal(again.headers.get('set-cookie').split(';')[0],a);
assert.equal((await call('/api/rooms',{},'kita_guest=forged-account-id')).status,401);
const roomBody={name:'Guest isolation test',type:'Other',location:'Local test only',area:'',notes:'',checklist:Array(5).fill('Not checked')};
const roomResponse=await call('/api/rooms',{method:'POST',...asJson(roomBody)},a);assert.equal(roomResponse.status,201);const room=await roomResponse.json();
assert((await (await call('/api/rooms',{},a)).json()).some(r=>r.id===room.id));
assert(!(await (await call('/api/rooms',{},b)).json()).some(r=>r.id===room.id));
assert.equal((await call('/api/rooms/'+room.id,{},b)).status,404);
assert.equal((await call('/api/settings',{method:'PUT',...asJson({apiUrl:''})},a)).status,403);
const settings=await (await call('/api/settings',{},a)).json();assert.equal(settings.apiUrl,'');assert.equal(settings.suggestedApiUrl,'');
assert.equal((await call('/api/connection-check?url=https://example.org',{},a)).status,401);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=','base64');
const upload=await call(`/api/rooms/${room.id}/media?name=guest-test.png`,{method:'POST',headers:{'Content-Type':'image/png'},body:png},a);assert.equal(upload.status,201);const media=await upload.json();
assert.equal((await call(`/api/media/${media.id}/file`,{},b)).status,404);
const key='test-reports/'+randomUUID()+'.json',now=new Date().toISOString();
const dir=new URL('../.sites-runtime/',import.meta.url);mkdirSync(dir,{recursive:true});const file=new URL('guest-test-report.json',dir);
writeFileSync(file,JSON.stringify({analyzedAt:now,kind:'image',samples:[{seconds:null,result:{yolo:{detections:[{label:'chair',confidence:.9}]}}}]}));
execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','r2','object','put','site-creator-r2/'+key,'--file',fileURLToPath(file),'--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state'],{encoding:'utf8'});
localDb(`UPDATE media SET report_key='${key}',analyzed_at='${now}' WHERE id='${media.id}'`);
const made=await call(`/api/media/${media.id}/checklist`,{method:'POST'},a);assert.equal(made.status,201);let list=await made.json();
assert.equal(list.roomId,room.id);
const mainRoom=await (await call('/api/rooms/'+list.roomId,{},a)).json();
assert(mainRoom.media.some(item=>item.id===list.mediaId));
assert.equal((await (await call(`/api/media/${media.id}/checklist`,{},a)).json()).mediaId,media.id);
assert.equal((await call(`/api/media/${media.id}/checklist`,{},b)).status,404);
const update=await call(`/api/checklists/${media.id}`,{method:'PUT',...asJson({action:'toggle',itemId:list.items[0].id,done:true,version:list.version})},a);assert.equal(update.status,200);
assert((await (await call(`/api/checklists/${media.id}`,{},a)).json()).items[0].done);
assert((await (await call(`/api/media/${media.id}/checklist`,{},a)).json()).items[0].done,'Main website must see Kita Clear completion');
assert.equal((await call(`/api/checklists/${media.id}`,{},b)).status,404);
assert.deepEqual(await (await call('/api/checklists',{},b)).json(),[]);
assert.equal((await call(`/api/media/${media.id}`,{method:'DELETE'},a)).status,200);
// Set the local global room budget one below its cap, then race two writes.
localDb(`UPDATE public_usage SET used=99 WHERE key='${quota}'`);
const raced=await Promise.all([call('/api/rooms',{method:'POST',...asJson(roomBody)},a),call('/api/rooms',{method:'POST',...asJson(roomBody)},b)]);
const raceDetails=await Promise.all(raced.map(async r=>({status:r.status,body:await r.text()})));
// Wrangler's local D1 CLI can restart a Worker; retry only that explicit emulator response.
for(const [index,response] of raceDetails.entries())if(response.status===503&&response.body.includes('Your worker restarted mid-request')){
  const retried=await call('/api/rooms',{method:'POST',...asJson(roomBody)},index===0?a:b);
  response.status=retried.status;response.body=await retried.text();
}
try{assert.deepEqual(raceDetails.map(r=>r.status).sort(),[201,429],JSON.stringify(raceDetails));}
finally{localDb(`UPDATE public_usage SET used=3 WHERE key='${quota}'`);}
console.log('Passed: anonymous access to main website and Kita Clear, shared rooms/uploads/checklist progress, guest-cookie reuse, browser isolation, protected settings/files, CSRF rejection and atomic quota enforcement.');
