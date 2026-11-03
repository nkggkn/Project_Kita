import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/room-points.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {roomPoints}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
assert.deepEqual(roomPoints({key_points:['Do not move the walking aid.','The door may be blocked.']},[]),['Do not move the walking aid.','The door may be blocked.']);
const caution='The floor looks clear, but the doorway width cannot be checked from this photo.';
const points=roomPoints({visible_observations:[caution],recommendations:['Check the doorway and keep the walking path clear.']},[{label:'chair'},{label:'chair'},{label:'box'}]);
assert(points.includes('Items: chair, box.'));
assert(points.includes('Check the doorway.'));
assert(!points.some(text=>text.includes('floor looks clear')),'A long caution must not be cut into a reassuring statement');
const negative=roomPoints({visible_observations:['Do not move the walking aid.']},[]);assert(negative.includes('Do not move the walking aid.'));
const neutral=roomPoints({potential_obstacles:['No loose wires are visible.']},[]);assert(neutral.includes('Check for loose wires.'));assert(!neutral.some(text=>text==='Loose wires are present.'));
assert(!roomPoints({overall_summary:'The scene was recorded with slight camera shake.'},[]).includes('Check for loose wires.'));
for(const analysis of [{},{key_points:['a '.repeat(25)]},{visible_observations:[caution]},{recommendations:['The floor may be wet. There are cables by the door.']}]){
 const result=roomPoints(analysis,[{label:'a '.repeat(60)}]);assert(result.length>=1&&result.length<=3);assert(result.every(text=>text.split(/\s+/).length<=12));
}
console.log('Passed: three short room points, preserved negation/uncertainty, no truncated safety claims, neutral checks, duplicate detections and bounded legacy fallbacks.');
