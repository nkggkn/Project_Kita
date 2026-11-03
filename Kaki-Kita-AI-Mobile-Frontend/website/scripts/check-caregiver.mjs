import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
async function load(path,replacements={}){
 let code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const [from,to] of Object.entries(replacements))code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');
 return {module:await import(url),url};
}
const validation=await load('../lib/validation.ts');
const {module:{COMMON_LANGUAGES,BUILTIN_TRANSLATIONS,languageInput,LANGUAGE_CODES}}=await load('../lib/languages.ts');
assert(LANGUAGE_CODES.length>150);
for(const language of COMMON_LANGUAGES){for(const phrase of ['Take a photo','Done','Quick points'])assert(BUILTIN_TRANSLATIONS[language.code][phrase]);}
assert.deepEqual(languageInput({locale:'my',texts:['Done','Done']}),{locale:'my',texts:['Done','Done']});
for(const value of [null,{locale:'bad<script>',texts:['Done']},{locale:'id',texts:[]},{locale:'id',texts:['x'.repeat(801)]}])assert.throws(()=>languageInput(value));
const {module:{translateTexts}}=await load('../lib/caregiver-api.ts',{'./validation':validation.url});
const original=globalThis.fetch;
try{
 globalThis.fetch=async()=>Response.json({translations:['Ambil foto','Selesai']});
 assert.deepEqual(await translateTexts('https://test.ngrok-free.dev','id',['Take a photo','Done']),['Ambil foto','Selesai']);
 globalThis.fetch=async()=>Response.json({translations:['wrong length']});
 await assert.rejects(()=>translateTexts('https://test.ngrok-free.dev','id',['Take a photo','Done']),/Translation is not available/);
}finally{globalThis.fetch=original;}
for(const path of ['app/room-library.tsx','app/project-pages.tsx','app/checklist/removal-app.tsx']){
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const parsed=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.equal(parsed.parseDiagnostics.length,0,path);
 let options=0;
 function visit(node){
  if(ts.isJsxOpeningElement(node)&&node.tagName.getText(parsed)==='option'){
   options++;assert(node.attributes.properties.some(attribute=>ts.isJsxAttribute(attribute)&&attribute.name.getText(parsed)==='value'),'Translated selects must keep original values');
  }
  if(ts.isJsxAttribute(node)&&node.initializer&&ts.isJsxExpression(node.initializer))assert(node.initializer.expression,'Empty JSX attribute after translation');
  ts.forEachChild(node,visit);
 }
 visit(parsed);assert(options>0);
}
console.log('Passed: caregiver languages, preserved form values, JSX rendering, translation validation and response boundaries.');
