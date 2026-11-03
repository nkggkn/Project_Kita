// Built local Worker only. The example.com test subdomain is not an AI provider. Only a synthetic image is used.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:8787';
const owner='scan-quota-local-'+randomUUID();
const headers={'oai-authenticated-user-id':owner,'oai-authenticated-user-email':'quota-test@sites.test'};
async function call(path,init={}){
 for(let attempt=0;attempt<3;attempt++){
  const response=await fetch(base+'/api'+path,{...init,headers:{...headers,...init.headers}});
  if(attempt<2&&response.status===503&&(await response.clone().text()).includes('Your worker restarted mid-request'))continue;
  return response;
 }
}
function sql(command){const output=execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--json','--command',command],{encoding:'utf8'});const start=output.indexOf('[');return JSON.parse(output.slice(start))[0].results;}
const json=value=>({headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
const day=new Date().toISOString().slice(0,10),visitor=`${day}:analysis:visitor:${owner}`,global=`${day}:analysis:global`;
const previous=sql(`SELECT * FROM public_usage WHERE key='${global}'`)[0];
const seed=(key,used)=>sql(`INSERT INTO public_usage(key,used,expires_at) VALUES('${key}',${used},${Math.floor(Date.now()/1000)+3600}) ON CONFLICT(key) DO UPDATE SET used=excluded.used`);
const used=key=>sql(`SELECT used FROM public_usage WHERE key='${key}'`)[0]?.used;
let mediaId;
try{
 const roomResponse=await call('/rooms',{method:'POST',...json({name:'Scan quota local integration',type:'Other',location:'',notes:'',area:'',checklist:Array(5).fill('Not checked')})});assert.equal(roomResponse.status,201);const room=await roomResponse.json();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=','base64');
 const upload=await call(`/rooms/${room.id}/media?name=quota-test.png`,{method:'POST',headers:{'Content-Type':'image/png'},body:png});assert.equal(upload.status,201);mediaId=(await upload.json()).id;
 sql(`INSERT INTO settings(owner,api_url) VALUES('${owner}','https://scan-quota-test.example.com')`);
 seed(visitor,25);seed(global,12);
 const blocked=await Promise.all([call(`/media/${mediaId}/analyze`,{method:'POST'}),call(`/media/${mediaId}/analyze`,{method:'POST'})]);
 for(const response of blocked){assert.equal(response.status,429);const body=await response.json();assert(body.error.includes('25 image checks'));assert(body.error.includes('8:00 AM Singapore'));}
 assert.equal(used(visitor),25);assert.equal(used(global),12,'Blocked requests must not consume global checks');
 seed(visitor,5);
 const admitted=await call(`/media/${mediaId}/analyze`,{method:'POST'});const result=await admitted.json();assert.equal(admitted.status,502,JSON.stringify(result));assert(!result.error.includes('25 image checks'),JSON.stringify(result));
 assert.equal(used(visitor),6,'The old five-check workspace must now be admitted');assert.equal(used(global),13);
 const original=await call(`/media/${mediaId}/file`);assert.equal(original.status,200);assert.equal((await call(`/media/${mediaId}/report`)).status,200);
 console.log('Passed: real local D1 rejects simultaneous capped scans without draining the shared budget, admits an old five-check workspace, and preserves the uploaded photo. example.com test subdomain; no AI billing.');
}finally{
 if(mediaId)await call(`/media/${mediaId}`,{method:'DELETE'});
 sql(`DELETE FROM settings WHERE owner='${owner}'`);sql(`DELETE FROM public_usage WHERE key='${visitor}'`);
 if(previous)sql(`INSERT INTO public_usage(key,used,expires_at) VALUES('${global}',${previous.used},${previous.expires_at}) ON CONFLICT(key) DO UPDATE SET used=excluded.used,expires_at=excluded.expires_at`);else sql(`DELETE FROM public_usage WHERE key='${global}'`);
}
