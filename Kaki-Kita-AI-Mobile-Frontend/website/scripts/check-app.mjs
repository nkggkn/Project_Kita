import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../lib/validation.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const validationUrl = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
const { roomInput, apiBase, validMagic, MIME_LIMITS } = await import(validationUrl);
const input = { name: ' Living room ', type: 'Living room', location: 'Home', notes: '', area: '', checklist: Array(5).fill('Not checked') };
assert.equal(roomInput(input).name, 'Living room');
assert.equal(roomInput(input).area, null);
for (const change of [{ name: '' }, { name: 'x'.repeat(101) }, { type: 'invalid' }, { area: '-1' }, { area: 'abc' }, { area: Infinity }, { checklist: [] }, { checklist: Array(5).fill('safe') }]) assert.throws(() => roomInput({ ...input, ...change }));
for (const url of ['http://example.com', 'https://127.0.0.1', 'https://localhost', 'https://a.internal', 'https://user:pass@host.com', 'https://host.com:8000', 'https://lovable.dev/projects/test']) assert.throws(() => apiBase(url));
assert.equal(apiBase('https://my-api.ngrok-free.app/'), 'https://my-api.ngrok-free.app');
assert.equal(apiBase(''), '');
assert(validMagic(new Uint8Array([255,216,255,224]), 'image/jpeg'));
assert(!validMagic(new TextEncoder().encode('<script>alert(1)</script>'), 'image/jpeg'));
assert(!validMagic(new Uint8Array(), 'video/mp4'));
assert.equal(MIME_LIMITS['video/mp4'], 25 * 1024 * 1024);
console.log('Passed: room validation, URL boundaries, media signatures and limits.');
const apiSource = readFileSync(new URL('../lib/kita-api.ts', import.meta.url), 'utf8');
const apiJs = ts.transpileModule(apiSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace('"./validation"', JSON.stringify(validationUrl));
const { checkKitaHealth, analysisFailure, networkReason, readAnalysis } = await import('data:text/javascript;base64,' + Buffer.from(apiJs).toString('base64'));
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url, init) => { assert.equal(url, 'https://demo.ngrok-free.dev/health'); assert.equal(init.headers['ngrok-skip-browser-warning'], '1'); assert.equal(init.redirect, 'manual'); return Response.json({status:'ok',gemini_model:'model'}); };
  assert.equal((await checkKitaHealth('https://demo.ngrok-free.dev')).analysisModel, 'model');
  globalThis.fetch = async () => Response.json({status:'ok',analysis_model:'claude-sonnet-4-6',services_loaded:133});
  assert.equal((await checkKitaHealth('https://demo.ngrok-free.dev')).analysisModel, 'claude-sonnet-4-6');
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(() => checkKitaHealth('https://demo.ngrok-free.dev'), /website server could not reach.*TypeError: fetch failed/);
  globalThis.fetch = async () => Response.json({ detail: 'offline' }, {status:503});
  await assert.rejects(() => checkKitaHealth('https://demo.ngrok-free.dev'), /HTTP 503/);
  globalThis.fetch = async () => new Response(null, {status:302,headers:{Location:'https://another.example'}});
  await assert.rejects(() => checkKitaHealth('https://demo.ngrok-free.dev'), /HTTP 302/);
  globalThis.fetch = async () => new Response('<html>ngrok offline</html>');
  await assert.rejects(() => checkKitaHealth('https://demo.ngrok-free.dev'), /did not return Kita Vision/);
  assert.match(analysisFailure(502, 'Image analysis failed. Check backend logs and retry.'), /API was reached.*inside the notebook/);
  assert.match(analysisFailure(429, null), /usage limit/);
  assert(!networkReason(new Error('failed https://example.com/?token=secret api_key=secret')).includes('secret'));
} finally { globalThis.fetch = originalFetch; }
console.log('Passed: health vs analysis failures, non-JSON gateway responses, network errors, and credential redaction.');
const report = {environment:'Room',overall_summary:'A description',visible_observations:[],potential_obstacles:[],accessibility_concerns:[],recommendations:[],limitations:['Review in person']};
assert.equal(readAnalysis({analysis:report}), report);
assert.equal(readAnalysis({claude:report}), report);
assert.equal(readAnalysis({gemini:report}), report);
assert.throws(() => readAnalysis({analysis:{...report,recommendations:'bad type'}}));
async function loadLocalModule(path, replaceValidation = false) {
  let code = ts.transpileModule(readFileSync(new URL(path, import.meta.url),'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  if(replaceValidation) code = code.replace('"./validation"',JSON.stringify(validationUrl));
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const {emptySafety,safetyInput} = await loadLocalModule('../lib/safety.ts',true);
const safety = {roomId:null,location:'Home',checks:emptySafety()};
assert.equal(safetyInput(safety).checks.length,6);
assert.throws(() => safetyInput({...safety,checks:[]}));
assert.throws(() => safetyInput({...safety,checks:safety.checks.map(c=>({...c,status:'Safe'}))}));
assert.throws(() => safetyInput({...safety,checks:safety.checks.map(c=>({...c,notes:'x'.repeat(2001)}))}));
const {normalizeService,filterServices} = await loadLocalModule('../lib/community.ts');
const service = normalizeService({properties:{Name:'kml_1',Description:'<table><tr><th>NAME</th><td>Centre &amp; Care</td></tr><tr><th>ADDRESSPOSTALCODE</th><td>012345</td></tr><tr><th>ADDRESSSTREETNAME</th><td>Real Street</td></tr></table>'},geometry:{type:'Point',coordinates:[103.8,1.3]}},0,'eldercare');
assert.equal(service.name,'Centre & Care');assert.equal(service.postal,'012345');assert.equal(service.address,'Real Street');
assert.deepEqual(service.coordinates,[103.8,1.3]);assert.equal(service.website,null);
assert.equal(filterServices([service],'care','012','eldercare').length,1);
assert.equal(filterServices([service],'care','999','eldercare').length,0);
assert.equal(normalizeService({properties:{HYPERLINK:'javascript:alert(1)'}},0).website,null);
assert.equal(normalizeService({properties:{Name:'kml_1'}},0).name,null);
assert.equal(normalizeService({properties:{NAME:'Real',ADDRESSPOSTALCODE:59817}},0).postal,'059817');
const data=JSON.parse(readFileSync(new URL('../data/community-services.json',import.meta.url),'utf8'));
assert(data.services.length>1000);assert(data.sources.length===2);assert(data.services.some(s=>s.category==='social'));assert(data.services.some(s=>s.category==='eldercare'));
console.log('Passed: current Claude notebook contract and legacy reports, six-item review validation, official GeoJSON parsing, missing fields, safe links, and combined directory search.');
const {tiltAt,placeTour,starterSteps}=await loadLocalModule('../lib/interaction.ts');
assert.deepEqual(tiltAt(50,50,100,100),{rotateX:0,rotateY:0,glareX:50,glareY:50});
assert.deepEqual(tiltAt(-20,200,100,100),{rotateX:-5,rotateY:-5,glareX:0,glareY:100});
assert.deepEqual(tiltAt(0,0,0,0),{rotateX:0,rotateY:0,glareX:50,glareY:50});
for(const viewport of [{width:390,height:844},{width:1265,height:712},{width:320,height:568}]){
 for(const target of [null,{top:90,left:20,width:350,height:300},{top:40,left:1000,width:180,height:50},{top:-100,left:0,width:500,height:1200}]){
  const pos=placeTour(viewport,target,{width:390,height:400});
  assert(pos.left>=16&&pos.top>=16);
  assert(pos.left+Math.min(390,viewport.width-32)<=viewport.width-16);
  assert(pos.top+Math.min(400,viewport.height-32)<=viewport.height-16);
 }
}
assert(starterSteps(0,0,false,0).every(s=>!s.done));
assert(starterSteps(1,2,true,1).every(s=>s.done));
assert.equal(starterSteps(1,2,true,0).filter(s=>s.done).length,3);
assert.equal(starterSteps(1,2,true,0)[3].view,'library');
console.log('Passed: bounded tilt angles, zero-size elements, tour placement on desktop/mobile, and real-data onboarding milestones.');

const {itemsFromReport,removalUpdate} = await loadLocalModule('../lib/removal-checklist.ts',true);
const detection=(label,confidence=.9)=>({label,confidence});
const sample=(objects,seconds=null)=>({seconds,result:{yolo:{detections:objects}}});
const snapshot=itemsFromReport({analyzedAt:'2026-11-02T08:00:00Z',samples:[
  sample([detection('person'),detection('chair')],1),
  sample([detection('chair'),detection('chair'),detection('bottle'),detection('dog')],5),
  sample([detection('bottle')],9)
]});
assert.equal(snapshot.sampleIndex,1);assert.equal(snapshot.seconds,5);
assert.deepEqual(snapshot.items.map(item=>item.label),['Chair 1','Chair 2','Bottle']);
assert(snapshot.items.every(item=>!item.done&&item.source==='detected'));
assert.equal(new Set(snapshot.items.map(item=>item.id)).size,3);
assert.equal(itemsFromReport({analyzedAt:'date',samples:[sample([detection('person'),detection('cat')])]}).items.length,0);
assert.throws(()=>itemsFromReport({samples:[]}));
assert.throws(()=>itemsFromReport({analyzedAt:'date',samples:[sample([detection('chair',Infinity)])]}));
assert.throws(()=>itemsFromReport({analyzedAt:'date',samples:[sample([detection('',.5)])]}));
assert.deepEqual(removalUpdate({action:'add',label:'  Floor boxes ',version:2}),{action:'add',label:'Floor boxes',version:2});
assert.deepEqual(removalUpdate({action:'toggle',itemId:'a',done:false,version:3}),{action:'toggle',itemId:'a',done:false,version:3});
for(const value of [null,{action:'add',label:' ',version:1},{action:'add',label:'x'.repeat(101),version:1},{action:'toggle',itemId:'a',done:'yes',version:1},{action:'toggle',itemId:'a',done:true,version:0},{action:'toggle',itemId:'a',done:true,version:'1'}]) assert.throws(()=>removalUpdate(value));
console.log('Passed: object checklist conversion, one-frame video deduplication, separate instances, people/animal exclusions, manual items, and update validation.');

const {newGuestToken,validGuestToken,guestOwner} = await loadLocalModule('../lib/guest-access.ts');
const guestA=newGuestToken(),guestB=newGuestToken();
assert(validGuestToken(guestA));assert.notEqual(guestA,guestB);
assert.equal(await guestOwner(guestA),await guestOwner(guestA));
assert.notEqual(await guestOwner(guestA),await guestOwner(guestB));
assert(!(await guestOwner(guestA)).includes(guestA));
assert((await guestOwner(guestA)).startsWith('guest:'));
for(const token of [null,'','account-owner','a'.repeat(63),'g'.repeat(64)]) assert(!validGuestToken(token));
assert.equal(await guestOwner('forged-account-id'),null);
console.log('Passed: opaque guest tokens, stable hashed ownership, distinct browser workspaces and invalid-cookie rejection.');
