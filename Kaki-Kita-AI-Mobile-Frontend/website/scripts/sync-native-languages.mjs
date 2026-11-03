import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync('lib/languages.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {BUILTIN_TRANSLATIONS}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const folder='android/app/src/main/assets';mkdirSync(folder,{recursive:true});
writeFileSync(folder+'/translations.json',JSON.stringify(BUILTIN_TRANSLATIONS));
console.log('Copied common UI languages into the Android project; no translation API required for these controls.');
