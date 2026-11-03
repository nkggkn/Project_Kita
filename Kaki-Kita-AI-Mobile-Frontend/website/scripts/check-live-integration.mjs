import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const endpoint=process.argv[2];
if(!endpoint?.startsWith('https://'))throw new Error('Pass the HTTPS notebook API address. This test makes one real image-analysis request.');
const base='http://127.0.0.1:8787/api', headers={'oai-authenticated-user-id':'live-integration-'+Date.now(),'oai-authenticated-user-email':'test@sites.test'};
async function call(path,init={}){const r=await fetch(base+path,{...init,headers:{...headers,...init.headers}});const data=await r.json();assert.equal(r.ok,true,JSON.stringify(data));return data;}
await call('/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiUrl:endpoint})});
const health=await call('/health');assert(health.analysisModel?.startsWith('claude-'));
const directory=await call('/services?source=notebook&category=eldercare');assert(directory.loaded>0);assert(directory.services.length>0);
const room=await call('/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Local live API test',type:'Other',location:'Synthetic test only',area:'',notes:'',checklist:Array(5).fill('Not checked')})});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=','base64');
// Use the synthetic gray fixture from the connection test when available.
let image;try{image=readFileSync('outputs/api-test-neutral.png')}catch{image=png;}
const media=await call(`/rooms/${room.id}/media?name=synthetic-live-test.png`,{method:'POST',headers:{'Content-Type':'image/png'},body:image});
try{
 const report=await call(`/media/${media.id}/analyze`,{method:'POST'});
 assert(report.samples[0].result.analysis.environment);
 assert(report.samples[0].result.models.vision_reasoning.startsWith('claude-'));
 const saved=await call(`/media/${media.id}/report`);assert.deepEqual(saved,report);
 const reopened=await call(`/rooms/${room.id}`);assert(reopened.media[0].analyzed_at);
 console.log('Passed: Worker health and notebook GeoJSON proxy, live Claude analysis, canonical report validation, R2 report persistence and room reloading. Model:',health.analysisModel);
}finally{await call(`/media/${media.id}`,{method:'DELETE'});}
