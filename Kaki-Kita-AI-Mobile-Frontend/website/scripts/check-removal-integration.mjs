// Local preview checks with a synthetic saved report; never calls an AI provider.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const base = 'http://127.0.0.1:8787';
const owner = 'checklist-test-' + randomUUID();
const temp = new URL('../.sites-runtime/', import.meta.url);
mkdirSync(temp, {recursive:true});
const image = readFileSync(new URL('../public/images/project-kita-community.jpg', import.meta.url));
async function call(path, init = {}, user = owner) {
  return fetch(base + '/api' + path, {...init, headers:{...(user ? {'oai-authenticated-user-id':user,'oai-authenticated-user-email':'test@sites.test'} : {}), ...init.headers}});
}
const json = body => ({headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function wrangler(...args) {
  return execFileSync(process.execPath, ['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js',...args,'--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state'], {cwd:new URL('../', import.meta.url),encoding:'utf8'});
}
async function seed(user, name) {
  const roomResponse = await call('/rooms',{method:'POST',...json({name,type:'Other',location:'Local test only',area:'',notes:'',checklist:Array(5).fill('Not checked')})},user);
  assert.equal(roomResponse.status,201);
  const room = await roomResponse.json();
  const uploaded = await call(`/rooms/${room.id}/media?name=checklist-test.jpg`,{method:'POST',headers:{'Content-Type':'image/jpeg'},body:image},user);
  assert.equal(uploaded.status,201);
  const media = await uploaded.json();
  assert.equal((await call(`/media/${media.id}/checklist`,{method:'POST'},user)).status,409);
  const now = new Date().toISOString(), key='test-reports/'+randomUUID()+'.json';
  const report = {kind:'image',analyzedAt:now,samples:[{seconds:null,result:{yolo:{detections:[
    {label:'chair',confidence:.91},{label:'chair',confidence:.82},{label:'bottle',confidence:.87},{label:'person',confidence:.99}
  ]}}}]};
  const reportFile = new URL('checklist-test-report.json',temp);
  writeFileSync(reportFile,JSON.stringify(report));
  wrangler('r2','object','put','site-creator-r2/'+key,'--file',fileURLToPath(reportFile));
  const escaped = value => value.replaceAll("'","''");
  wrangler('d1','execute','DB','--command',`UPDATE media SET report_key='${escaped(key)}',analyzed_at='${now}' WHERE id='${media.id}'`);
  return media.id;
}

assert.equal((await call('/checklists',{},null)).status,401);
const id=await seed(owner,'Checklist integration test');
let response=await call(`/media/${id}/checklist`,{method:'POST'});
assert.equal(response.status,201);
let list=await response.json();
assert.deepEqual(list.items.map(item=>item.label),['Chair 1','Chair 2','Bottle']);
assert.equal(list.version,1);
assert.equal((await call('/checklists',{},'other-user')).status,200);
assert.deepEqual(await (await call('/checklists',{},'other-user')).json(),[]);
for(const [path,method] of [[`/checklists/${id}`,'GET'],[`/checklists/${id}`,'PUT'],[`/media/${id}/checklist`,'POST']]) assert.equal((await call(path,{method},'other-user')).status,404);
assert.equal((await call(`/checklists/${id}`,{method:'PUT',headers:{Origin:'https://evil.test'}})).status,403);
response=await call(`/checklists/${id}`,{method:'PUT',...json({action:'toggle',itemId:list.items[0].id,done:true,version:list.version})});
assert.equal(response.status,200); list=await response.json(); assert(list.items[0].done); assert.equal(list.version,2);
assert((await (await call(`/checklists/${id}`)).json()).items[0].done);
assert((await (await call(`/media/${id}/checklist`,{method:'POST'})).json()).items[0].done);
const conflict=await call(`/checklists/${id}`,{method:'PUT',...json({action:'toggle',itemId:list.items[0].id,done:false,version:1})});
assert.equal(conflict.status,409);
assert((await (await call(`/checklists/${id}`)).json()).items[0].done);
response=await call(`/checklists/${id}`,{method:'PUT',...json({action:'toggle',itemId:list.items[0].id,done:false,version:list.version})});
assert.equal(response.status,200);list=await response.json();assert(!list.items[0].done);
response=await call(`/checklists/${id}`,{method:'PUT',...json({action:'add',label:'Boxes by the door',version:list.version})});
assert.equal(response.status,200);list=await response.json();assert.equal(list.items.at(-1).source,'manual');assert.equal(list.items.length,4);
const summary=(await (await call('/checklists')).json()).find(item=>item.mediaId===id);
assert.equal(summary.total,4);assert.equal(summary.done,0);
assert.equal((await call(`/checklists/${id}`,{method:'PUT',...json({action:'toggle',itemId:list.items[0].id,done:'yes',version:list.version})})).status,400);
assert.equal((await call(`/media/${id}`,{method:'DELETE'})).status,200);
assert.equal((await call(`/checklists/${id}`)).status,404);
console.log('Passed: checklist create/reopen, saved completion and undo, manual additions, owner isolation, cross-origin rejection, stale-edit conflicts, validation and deletion cascade.');
if(process.argv.includes('--keep-preview')) {
  const mediaId=await seed('local_seedy','Checklist QA room (local only)');
  await call(`/media/${mediaId}/checklist`,{method:'POST'},'local_seedy');
  writeFileSync(new URL('checklist-qa.json',temp),JSON.stringify({mediaId}));
  console.log('Local-only browser fixture:',mediaId);
}
