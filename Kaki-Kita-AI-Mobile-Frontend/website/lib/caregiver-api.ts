import { InputError } from "./validation";
export async function translateTexts(base:string,locale:string,texts:string[]) {
  let response:Response;
  try{response=await fetch(base+"/translate",{method:"POST",body:JSON.stringify({locale,texts}),headers:{"Content-Type":"application/json","ngrok-skip-browser-warning":"1"},redirect:"manual",signal:AbortSignal.timeout(60000)});}
  catch{throw new InputError("Translation is not available. Try again later.",502);}
  const data=await response.json().catch(()=>null) as {translations?:unknown}|null;
  if(!response.ok || !Array.isArray(data?.translations) || data.translations.length!==texts.length || !data.translations.every(text=>typeof text==="string" && text.trim() && text.length<=5000))throw new InputError("Translation is not available. Try again later.",502);
  return data.translations as string[];
}
