type Detection={label:string};
function list(value:unknown):string[]{return Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"&&!!item.trim()):[];}
const words=(text:string)=>text.trim().split(/\s+/).length;
export function roomPoints(analysis:Record<string,unknown>,detections:Detection[]):string[]{
  const explicit=list(analysis.key_points).map(text=>text.trim()).filter(text=>text.length<=160&&words(text)<=12);
  if(explicit.length)return [...new Set(explicit)].slice(0,3);
  // Keep whole short observations; never cut off a warning or a "not" clause.
  const points=list(analysis.visible_observations).map(text=>text.trim()
    .replace(/\bpedestrians\b/gi,"people").replace(/\billumination\b/gi,"light")
    .replace(/\bobstructions\b/gi,"things in the way").replace(/\bapproximately\b/gi,"about")
    .replace(/\bappears to be\b/gi,"looks").replace(/\bis visible\b/gi,"can be seen"))
    .filter(text=>text.length<=160&&words(text)<=12).slice(0,2);
  if(!points.length){
    const names=[...new Set(detections.map(item=>item.label.trim()).filter(name=>!!name&&name.length<=40&&words(name)<=3))].slice(0,3);
    if(names.length)points.push("Items: "+names.join(", ")+".");
  }
  const source=[analysis.overall_summary,...list(analysis.potential_obstacles),...list(analysis.accessibility_concerns),...list(analysis.recommendations)].filter(value=>typeof value==="string").join(" ");
  // These are checks to do, not claims that a hazard is present.
  const checks:[RegExp,string][]=[
    [/\b(cables?|wires?|cords?)\b/i,"Check for loose wires."],
    [/\b(wet|slippery|slips?|spills?|spillage)\b/i,"Check that the floor is dry."],
    [/\b(walkways?|walking|paths?|routes?|corridors?)\b/i,"Keep paths clear."],
    [/\b(clutter|cluttered|rubbish|trash|loose items)\b/i,"Check for loose items."],
    [/\b(doors?|doorways?|exits?|entrance)\b/i,"Check the doorway."],
    [/\b(light|lighting|dark|dim)\b/i,"Check the light."],
  ];
  for(const [match,text] of checks)if(points.length<3&&match.test(source)&&!points.includes(text))points.push(text);
  if(!points.length)points.push("Look around the room.");
  if(points.length<3&&!points.includes("Keep paths clear."))points.push("Keep paths clear.");
  if(points.length<3)points.push("Ask a helper if unsure.");
  return [...new Set(points)].slice(0,3);
}
