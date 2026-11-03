"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MoonStar, Sparkles } from "lucide-react";
import { useLanguage } from "./language-provider";

const Motion = createContext({calm:false,reduced:false,toggle:()=>{}});
export const usePlayfulMotion=()=>useContext(Motion);
type Pulse={id:number;x:number;y:number};

export default function PlayfulExperience({children}:{children:ReactNode}) {
  const [ready,setReady]=useState(false),[paused,setPaused]=useState(false),[reduced,setReduced]=useState(false),[hidden,setHidden]=useState(false),[pulses,setPulses]=useState<Pulse[]>([]);
  const sequence=useRef(0),cleanup=useRef<ReturnType<typeof setTimeout>|null>(null);
  const calm=!ready||paused||reduced;
  useEffect(()=>{
    try{setPaused(localStorage.getItem("kita-calm-mode-v1")==="true");}catch{}
    const preference=matchMedia("(prefers-reduced-motion: reduce)");
    const update=()=>setReduced(preference.matches),visibility=()=>setHidden(document.hidden);
    update();visibility();setReady(true);preference.addEventListener("change",update);document.addEventListener("visibilitychange",visibility);
    return()=>{preference.removeEventListener("change",update);document.removeEventListener("visibilitychange",visibility);};
  },[]);
  const toggle=useCallback(()=>{if(reduced)return;const next=!paused;setPaused(next);try{localStorage.setItem("kita-calm-mode-v1",String(next));}catch{}},[paused,reduced]);
  useEffect(()=>{
    if(calm){setPulses([]);return;}
    function tap(event:MouseEvent){
      if(document.hidden||event.button!==0||!(event.target instanceof Element))return;
      const target=event.target.closest("button,a,.clear-item");
      if(!target||target.matches(":disabled,[aria-disabled='true']")||target.querySelector("input:disabled"))return;
      const rect=target.getBoundingClientRect();
      if(!rect.width||!rect.height)return;
      const keyboard=event.detail===0;
      const x=Math.max(12,Math.min(innerWidth-12,keyboard?rect.left+rect.width/2:event.clientX));
      const y=Math.max(12,Math.min(innerHeight-12,keyboard?rect.top+rect.height/2:event.clientY));
      setPulses(previous=>[...previous.slice(-5),{id:++sequence.current,x,y}]);
      if(cleanup.current)clearTimeout(cleanup.current);
      cleanup.current=setTimeout(()=>setPulses([]),850);
    }
    document.addEventListener("click",tap,true);
    return()=>{document.removeEventListener("click",tap,true);if(cleanup.current)clearTimeout(cleanup.current);};
  },[calm]);
  const value=useMemo(()=>({calm,reduced,toggle}),[calm,reduced,toggle]);
  return <Motion.Provider value={value}><div className="playful-experience" data-calm={calm?"true":"false"} data-sleeping={hidden?"true":"false"}>
    <div className="garden-background" aria-hidden="true"><span className="garden-glow glow-mint"/><span className="garden-glow glow-peach"/><span className="garden-glow glow-lilac"/><span className="garden-flower flower-one"/><span className="garden-flower flower-two"/><span className="garden-spark spark-one">✦</span><span className="garden-spark spark-two">✧</span><span className="garden-leaf leaf-one"/><span className="garden-leaf leaf-two"/></div>
    {children}
    <div className="tap-effects" aria-hidden="true">{pulses.map(pulse=><span key={pulse.id} className="tap-burst" style={{left:pulse.x,top:pulse.y}} onAnimationEnd={event=>{if(event.target===event.currentTarget)setPulses(previous=>previous.filter(item=>item.id!==pulse.id));}}><i/><b>✦</b><b>✧</b><em/></span>)}</div>
  </div></Motion.Provider>;
}

export function CalmMode(){
  const {calm,reduced,toggle}=usePlayfulMotion(),{t}=useLanguage();
  return <button type="button" className="calm-mode" aria-pressed={calm} disabled={reduced} onClick={toggle} title={reduced?t("Reduced motion is enabled on your device."):calm?t("Play animations"):t("Pause animations")}>
    {calm?<MoonStar size={20}/>:<Sparkles size={20}/>}<span>{t("Calm mode")}</span><span className="calm-switch" aria-hidden="true"><i/></span>
  </button>;
}
