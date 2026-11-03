// Uses isolated local data and synthetic images; never calls a live AI provider.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import sharp from 'sharp';
const base='http://127.0.0.1:8787';
async function call(path,init={},cookie=''){
  const options={...init,headers:{...(cookie?{Cookie:cookie}:{}),...init.headers}};
  for(let attempt=0;attempt<3;attempt++){
    const response=await fetch(base+'/api'+path,options);
    if(attempt<2&&response.status===503&&(await response.clone().text()).includes('Your worker restarted mid-request'))continue;
    return response;
  }
}
const json=value=>({headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
const command=args=>execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js',...args,'--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state'],{encoding:'utf8'});
const sql=text=>command(['d1','execute','DB','--command',text]);
const cookie=async()=>(await call('/visitor',{method:'POST'})).headers.get('set-cookie').split(';')[0];
const a=await cookie(),b=await cookie();
assert.equal((await call('/translate',{method:'POST',...json({locale:'id',texts:['Take a photo']})})).status,401);
let response=await call('/translate',{method:'POST',...json({locale:'id',texts:['Take a photo','Done','Take a photo']})},a);
assert.equal(response.status,200);assert.deepEqual((await response.json()).translations,['Ambil foto','Selesai','Ambil foto']);
assert.equal((await call('/translate',{method:'POST',...json({locale:'no-such-language',texts:['Done']})},a)).status,400);
assert.equal((await call('/translate',{method:'POST',...json({locale:'id',texts:['Done']}),headers:{'Content-Type':'application/json',Origin:'https://evil.test'}},a)).status,403);
const owner='guest:'+createHash('sha256').update(a.split('=')[1]).digest('hex');
const phrase='Synthetic private translation '+randomUUID();
const key=createHash('sha256').update(owner+'\nid\n'+phrase).digest('hex');
sql(`INSERT INTO translations(id,owner,locale,translated,created_at) VALUES('${key}','${owner}','id','Private local cache','${new Date().toISOString()}')`);
response=await call('/translate',{method:'POST',...json({locale:'id',texts:[phrase]})},a);assert.equal(response.status,200);assert.deepEqual((await response.json()).translations,['Private local cache']);
assert.equal((await call('/translate',{method:'POST',...json({locale:'id',texts:[phrase]})},b)).status,503);
const room=await (await call('/rooms',{method:'POST',...json({name:'Caregiver integration local test',type:'Other',location:'',notes:'',area:'',checklist:Array(5).fill('Not checked')})},a)).json();assert(room.id);
const image=await sharp({create:{width:16,height:16,channels:3,background:'#dce8cf'}}).jpeg().toBuffer();
response=await call(`/rooms/${room.id}/media?name=synthetic-test.jpg`,{method:'POST',headers:{'Content-Type':'image/jpeg'},body:image},a);assert.equal(response.status,201);const media=await response.json();
assert.equal((await call(`/media/${media.id}/clean-preview`,{},a)).status,404);
assert.equal((await call(`/media/${media.id}/clean-preview`,{method:'POST'},a)).status,404);
assert.equal((await call(`/media/${media.id}/clean-preview`,{},b)).status,404);
assert.equal((await call(`/media/${media.id}/clean-preview/image`,{},a)).status,404);
mkdirSync('.sites-runtime',{recursive:true});writeFileSync('.sites-runtime/synthetic-clean-preview.jpg',image);
const previewKey='test-clean-previews/'+randomUUID()+'.jpg';
command(['r2','object','put','site-creator-r2/'+previewKey,'--file','.sites-runtime/synthetic-clean-preview.jpg']);
const now=new Date().toISOString();sql(`INSERT INTO clean_previews(media_id,owner,status,preview_key,started_at,updated_at) VALUES('${media.id}','${owner}','ready','${previewKey}','${now}','${now}')`);
// Existing generated files must not bring the removed feature back.
assert.equal((await call(`/media/${media.id}/clean-preview`,{},a)).status,404);
assert.equal((await call(`/media/${media.id}/clean-preview`,{method:'POST'},a)).status,404);
assert.equal((await call(`/media/${media.id}/clean-preview/image`,{},a)).status,404);
response=await call(`/media/${media.id}/file`,{},a);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),image);
assert.equal((await call(`/media/${media.id}/file`,{},b)).status,404);
assert.equal((await call(`/media/${media.id}/clean-preview/image`,{},b)).status,404);
assert.equal((await call(`/media/${media.id}`,{method:'DELETE'},a)).status,200);
assert.equal((await call(`/media/${media.id}/clean-preview/image`,{},a)).status,404);
assert(sql(`SELECT count(*) count FROM clean_previews WHERE media_id='${media.id}'`).includes('"count": 0'));
console.log('Passed: translation validation/cache isolation/CSRF, removed generation routes, original-photo access/isolation and legacy preview deletion cascade. No AI calls.');
