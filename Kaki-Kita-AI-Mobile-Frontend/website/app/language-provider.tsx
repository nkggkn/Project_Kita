"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Languages, LoaderCircle } from "lucide-react";
import { BUILTIN_TRANSLATIONS, COMMON_LANGUAGES, LANGUAGE_CODES, RTL_LANGUAGES } from "@/lib/languages";
import { callApi } from "@/lib/client-api";

type LanguageContext = { locale: string; t: (text: unknown) => string; choose: (code: string) => void; status: string; retry: () => void };
const Context = createContext<LanguageContext>({locale:"en",t:value=>String(value ?? ""),choose:()=>{},status:"",retry:()=>{}});
export const useLanguage = () => useContext(Context);

export default function LanguageProvider({children}:{children:ReactNode}) {
  const [locale,setLocale] = useState("en"), [version,setVersion] = useState(0), [status,setStatus] = useState("");
  const cache = useRef<Record<string,Record<string,string>>>({});
  const pending = useRef(new Set<string>()), busy = useRef(false), blocked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), localeRef = useRef("en");
  const flush = useRef<()=>Promise<void>>(async()=>{});
  const schedule = useCallback(() => {
    if (!timer.current && !blocked.current) timer.current = setTimeout(()=>{timer.current=null;void flush.current();},250);
  },[]);
  const choose = useCallback((code:string) => {
    if (!LANGUAGE_CODES.includes(code)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current=null; pending.current.clear(); blocked.current=false; localeRef.current=code;
    setLocale(code); setStatus("");
    try {localStorage.setItem("kita-language-v1",code);} catch {}
  },[]);
  useEffect(()=>{try {const saved=localStorage.getItem("kita-language-v1");if(saved)choose(saved);}catch{}},[choose]);
  useEffect(()=>{document.documentElement.lang=locale;document.documentElement.dir=RTL_LANGUAGES.has(locale)?"rtl":"ltr";},[locale]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  flush.current = async () => {
    if(busy.current || blocked.current || localeRef.current==="en" || !pending.current.size) return;
    const code=localeRef.current, batch:string[]=[];
    let length=0;
    for(const text of pending.current) {if(batch.length>=40 || length+text.length>6400)break;batch.push(text);length+=text.length;}
    if(!batch.length)return;
    batch.forEach(text=>pending.current.delete(text)); busy.current=true; setStatus("loading");
    try {
      const result=await callApi<{translations:string[]}>("/translate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({locale:code,texts:batch})});
      if(!Array.isArray(result.translations)||result.translations.length!==batch.length||!result.translations.every(value=>typeof value==="string"))throw new Error("Invalid translation");
      const target=cache.current[code] ||= {};
      batch.forEach((text,index)=>{target[text]=result.translations[index];});
      setVersion(value=>value+1);
      if(code===localeRef.current)setStatus("");
    }catch{
      if(code===localeRef.current){batch.forEach(text=>pending.current.add(text));blocked.current=true;setStatus("error");}
    }finally{busy.current=false;if(pending.current.size && !blocked.current)schedule();}
  };
  const t=useCallback((value:unknown) => {
    const source=String(value ?? ""), key=source.trim();
    if(locale==="en" || !key || !/[\p{L}]/u.test(key)) return source;
    if(Object.values(BUILTIN_TRANSLATIONS[locale] || {}).includes(key) || Object.values(cache.current[locale] || {}).includes(key))return source;
    let translated=BUILTIN_TRANSLATIONS[locale]?.[key] || cache.current[locale]?.[key];
    const numbered=key.match(/^(.+?) (\d+)$/);
    if(!translated && numbered && BUILTIN_TRANSLATIONS[locale]?.[numbered[1]])translated=BUILTIN_TRANSLATIONS[locale][numbered[1]]+" "+numbered[2];
    if(!translated && key.length<=800){pending.current.add(key);schedule();}
    return translated ? (source.match(/^\s*/)?.[0] || "")+translated+(source.match(/\s*$/)?.[0] || "") : source;
  },[locale,version,schedule]);
  return <Context.Provider value={{locale,t,choose,status,retry:()=>{blocked.current=false;setStatus("");schedule();}}}>{children}</Context.Provider>;
}

export function LanguagePicker() {
  const {locale,t,choose,status,retry}=useLanguage();
  const [others,setOthers]=useState(()=>LANGUAGE_CODES.filter(code=>!COMMON_LANGUAGES.some(item=>item.code===code)).map(code=>({code,name:code})));
  useEffect(()=>{
    const names=new Intl.DisplayNames(["en"],{type:"language"});
    setOthers(LANGUAGE_CODES.filter(code=>!COMMON_LANGUAGES.some(item=>item.code===code)).map(code=>{
      let native=code;try{native=new Intl.DisplayNames([code],{type:"language"}).of(code)||code;}catch{}
      return {code,name:`${native} · ${names.of(code)||code}`};
    }).sort((a,b)=>a.name.localeCompare(b.name)));
  },[]);
  return <div className="language-control"><label className="language-picker"><span className="language-medallion" aria-hidden="true"><Languages size={21}/></span><span className="language-copy"><span className="language-tagline">{t("Your language")}</span><select aria-label="Choose language" value={locale} onChange={event=>choose(event.target.value)}><optgroup label="Common languages">{COMMON_LANGUAGES.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}</optgroup><optgroup label="More languages">{others.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}</optgroup></select></span></label>{status==="loading"&&<span className="translation-status" role="status"><LoaderCircle size={14} className="spin"/>{t("Loading…")}</span>}{status==="error"&&<button className="translation-status" title="Some words could not be translated" onClick={retry}>{t("Try again")}</button>}</div>;
}
