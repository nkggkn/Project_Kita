"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCheck, CircleHelp, Coffee, Download, FileText, Film, FolderOpen, Home, MoreHorizontal, ScanLine, Settings2, ShieldCheck, Users, X } from "lucide-react";
import { useLanguage } from "./language-provider";
import { CalmMode } from "./playful-experience";

type InstallEvent = Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export default function MobileNavigation({view,onNavigate,onHelp,disabled=false}:{view:string;onNavigate:(view:string)=>void;onHelp?:()=>void;disabled?:boolean}) {
  const {t}=useLanguage(),dialog=useRef<HTMLDialogElement>(null);
  const [open,setOpen]=useState(false),[install,setInstall]=useState<InstallEvent|null>(null),[instructions,setInstructions]=useState(false),[native,setNative]=useState(false);
  useEffect(()=>{
    setNative(navigator.userAgent.includes("KakiKitaAndroid"));
    function available(event:Event){event.preventDefault();setInstall(event as InstallEvent);}
    function installed(){setInstall(null);setInstructions(false);}
    window.addEventListener("beforeinstallprompt",available);window.addEventListener("appinstalled",installed);
    return()=>{window.removeEventListener("beforeinstallprompt",available);window.removeEventListener("appinstalled",installed);};
  },[]);
  useEffect(()=>{if(!open)return;const old=document.body.style.overflow;document.body.style.overflow="hidden";dialog.current?.showModal();return()=>{dialog.current?.close();document.body.style.overflow=old;};},[open]);
  function go(next:string){setOpen(false);setInstructions(false);onNavigate(next);}
  async function addApp(){if(install){await install.prompt();await install.userChoice;setInstall(null);}else setInstructions(true);}
  const primary=[["home","Home",Home],["vision","Vision",ScanLine],["watch","Watch",Film],["checklist","Tasks",CheckCheck]] as const;
  const other=[["library","My rooms",FolderOpen],["safety","Room checks",ShieldCheck],["kopi","Community help",Coffee],["reports","Reports",FileText],["about","About",Users],["settings","Settings",Settings2]] as const;
  return <><nav className="mobile-navigation" aria-label={t("App navigation")}>{primary.map(([key,label,Icon])=><button key={key} aria-current={view===key?"page":undefined} disabled={disabled} onClick={()=>go(key)}><Icon size={24}/><span>{t(label)}</span></button>)}<button aria-current={other.some(([key])=>view===key)?"page":undefined} aria-haspopup="dialog" disabled={disabled} onClick={()=>setOpen(true)}><MoreHorizontal size={25}/><span>{t("More")}</span></button></nav>{open&&<dialog ref={dialog} className="mobile-menu" aria-labelledby="mobile-menu-title" onCancel={()=>setOpen(false)} onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}}><div className="mobile-menu-content"><header><h2 id="mobile-menu-title">{t("All features")}</h2><button className="icon-button" aria-label={t("Close menu")} onClick={()=>setOpen(false)}><X size={24}/></button></header><div className="mobile-menu-grid">{other.map(([key,label,Icon])=><button key={key} onClick={()=>go(key)}><Icon size={26}/><span>{t(label)}</span></button>)}{onHelp&&<button onClick={()=>{setOpen(false);onHelp();}}><CircleHelp size={26}/><span>{t("Show me how")}</span></button>}{!native&&<button onClick={addApp}><Download size={26}/><span>{t("Add to home screen")}</span></button>}<CalmMode/></div>{instructions&&<p className="install-instructions" role="status">{t("iPhone: open in Safari, tap Share, then Add to Home Screen. Android: open the browser menu, then Add to home screen or Install app.")}</p>}</div></dialog>}</>;
}
