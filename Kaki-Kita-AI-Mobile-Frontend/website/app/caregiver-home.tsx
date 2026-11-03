"use client";
import { ArrowRight, Camera, CheckCheck, Coffee, Film, FolderOpen, ShieldCheck } from "lucide-react";
import { useLanguage } from "./language-provider";
import KitaBuddy from "./kita-buddy";
import { CalmMode } from "./playful-experience";
export default function CaregiverHome({onNavigate}:{onNavigate:(view:string)=>void}) {
  const {t}=useLanguage();
  const actions=[
    {view:"vision",title:"Check a room",hint:"Take a photo",icon:Camera},
    {view:"watch",title:"Watch",hint:"Live camera or video",icon:Film},
    {view:"checklist",title:"My tasks",hint:"Tick items when done",icon:CheckCheck},
    {view:"library",title:"My rooms",hint:"Your saved photos and videos",icon:FolderOpen},
    {view:"safety",title:"Room checks",hint:"Check the room yourself",icon:ShieldCheck},
    {view:"kopi",title:"Community help",hint:"Find nearby support",icon:Coffee},
  ];
  return <div className="caregiver-home"><div className="buddy-welcome"><header><span className="buddy-hello">{t("Your room buddy")}</span><h1>{t("What would you like to do?")}</h1><p>{t("Choose one. We will guide you.")}</p></header><KitaBuddy/></div><div className="buddy-home-tools"><CalmMode/></div><div className="app-feature-grid">{actions.map(({view,title,hint,icon:Icon})=><button key={view} onClick={()=>onNavigate(view)}><span className="app-feature-icon"><Icon size={31}/></span><span><strong>{t(title)}</strong><small>{t(hint)}</small></span><ArrowRight size={23}/></button>)}</div></div>;
}
