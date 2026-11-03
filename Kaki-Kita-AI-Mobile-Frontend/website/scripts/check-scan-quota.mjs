import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64');
const validation=url(readFileSync('lib/validation.ts','utf8'));
const guest=url(readFileSync('lib/guest-access.ts','utf8'));
const source=readFileSync('lib/public-quota.ts','utf8').replace('"./validation"',JSON.stringify(validation)).replace('"./guest-access"',JSON.stringify(guest));
const {claimAnalysis}=await import(url(source));
const sqlite=new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE public_usage(key TEXT PRIMARY KEY,used INTEGER NOT NULL,expires_at INTEGER NOT NULL)');
const db={prepare(sql){return {bind(...params){const statement=sqlite.prepare(sql);return {async all(){return {results:statement.all(...params)};},async first(){return statement.get(...params)||null;},async run(){return statement.run(...params);}};}};}};
const day=new Date().toISOString().slice(0,10),owner='quota-test-owner',ip='198.51.100.42';
const request=new Request('https://site.test/api/media/test/analyze',{headers:{'cf-connecting-ip':ip}});
const keys=[`${day}:analysis:visitor:${owner}`,`${day}:analysis:network:${createHash('sha256').update(ip).digest('hex')}`,`${day}:analysis:global`];
const read=()=>keys.map(key=>sqlite.prepare('SELECT used FROM public_usage WHERE key=?').get(key)?.used||0);
function seed(values){sqlite.exec('DELETE FROM public_usage');values.forEach((used,index)=>sqlite.prepare('INSERT INTO public_usage VALUES(?,?,?)').run(keys[index],used,Math.floor(Date.now()/1000)+3600));}
// A browser that used the old five-check cap can now scan.
seed([5,5,12]);await claimAnalysis(db,request,owner,1);assert.deepEqual(read(),[6,6,13]);
// Hitting any budget leaves all three counters unchanged, even on repeated taps.
for(const [values,scope] of [[[25,5,12],'workspace'],[[5,50,12],'network'],[[5,5,100],'website']]){
 seed(values);
 for(let attempt=0;attempt<5;attempt++)await assert.rejects(()=>claimAnalysis(db,request,owner,1),error=>error.status===429&&error.message.toLowerCase().includes(scope)&&error.message.includes('8:00 AM Singapore'));
 assert.deepEqual(read(),values);
}
// Videos reserve exactly three checks or none; a photo can use the last check.
seed([23,5,12]);await assert.rejects(()=>claimAnalysis(db,request,owner,3),error=>error.status===429);assert.deepEqual(read(),[23,5,12]);
seed([22,5,12]);await claimAnalysis(db,request,owner,3);assert.deepEqual(read(),[25,8,15]);
seed([24,49,99]);const raced=await Promise.allSettled([claimAnalysis(db,request,owner,1),claimAnalysis(db,request,owner,1)]);assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(read(),[25,50,100]);
sqlite.exec('DELETE FROM public_usage');await claimAnalysis(db,request,owner,1);assert.deepEqual(read(),[1,1,1]);
seed([0,0,0]);for(const invalid of [0,2,4,NaN,-1])await assert.rejects(()=>claimAnalysis(db,request,owner,invalid),error=>error.status===400);assert.deepEqual(read(),[0,0,0]);
sqlite.close();
console.log('Passed: old five-check workspace recovery, all-or-none reservations for every cap, repeated blocked taps, three-frame video costs, last-check race and invalid-input rejection. Real SQLite statements; no AI calls.');
