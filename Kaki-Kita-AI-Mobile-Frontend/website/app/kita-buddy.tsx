"use client";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./language-provider";

export function BuddyArt({className=""}:{className?:string}){
  return <svg className={`buddy-art ${className}`} viewBox="0 0 240 240" fill="none" aria-hidden="true" focusable="false">
    <ellipse className="buddy-shadow" cx="120" cy="216" rx="61" ry="9" fill="#285C46" fillOpacity=".12"/>
    <g className="buddy-float" stroke="#315B46" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M159 62V43Q159 37 165 37H175Q181 37 181 43V78" fill="#F8D39B"/>
      <g className="buddy-feet" fill="#F5CC98"><ellipse cx="91" cy="200" rx="16" ry="9"/><ellipse cx="149" cy="200" rx="16" ry="9"/></g>
      <path className="buddy-left-arm" d="M64 144Q42 158 35 143Q32 136 38 132Q43 129 48 136L62 128" fill="#A7CFA9"/>
      <path className="buddy-wave" d="M175 140Q199 140 204 119Q207 108 214 113Q221 120 212 140Q205 158 175 159" fill="#A7CFA9"/>
      <path d="M63 94Q63 77 81 77H159Q177 77 177 95V164Q177 198 146 201H94Q63 198 63 167Z" fill="#BFDFB2"/>
      <path d="M74 154Q74 190 100 190H146Q166 188 171 167" stroke="#DFF0D3" strokeWidth="8"/>
      <path d="M43 97Q36 90 45 82L105 34Q120 22 135 34L195 82Q204 91 196 98Q190 104 184 100L132 60Q120 51 108 60L56 100Q48 105 43 97Z" fill="#F0BDA5"/>
      <path d="M53 87L113 40Q120 35 128 40L188 87" stroke="#FFE2C7" strokeWidth="4"/>
      <path d="M121 32Q98 33 98 13Q120 10 121 32Z" fill="#77AA74"/>
      <path d="M121 32Q123 9 145 12Q147 31 121 32Z" fill="#A5C989"/>
      <g className="buddy-eyes" stroke="none"><ellipse cx="94" cy="126" rx="6.5" ry="8" fill="#284C3C"/><ellipse cx="146" cy="126" rx="6.5" ry="8" fill="#284C3C"/><circle cx="96" cy="123" r="2" fill="white"/><circle cx="148" cy="123" r="2" fill="white"/></g>
      <g stroke="none" fill="#EBA994" fillOpacity=".8"><ellipse cx="83" cy="141" rx="10" ry="6"/><ellipse cx="157" cy="141" rx="10" ry="6"/></g>
      <path d="M108 145Q120 158 132 145" strokeWidth="4"/>
      <path d="M120 182L109 173Q101 165 108 160Q114 156 120 164Q126 156 132 160Q139 165 131 173Z" fill="#EFAF9A" strokeWidth="2.5"/>
    </g>
    <g className="buddy-hearts" stroke="none" fill="#D99B87"><path d="M189 38Q180 27 173 34Q166 41 178 49L187 55L196 45Q204 33 196 31Q192 30 189 38Z"/><path d="M44 120Q37 112 32 117Q27 122 35 128L42 133L49 125Q54 116 48 115Q45 114 44 120Z"/></g>
    <path className="buddy-sparkle" d="M35 57L39 68L50 72L39 76L35 87L31 76L20 72L31 68Z" fill="#E7C77B"/>
  </svg>;
}

export default function KitaBuddy(){
  const {t}=useLanguage(),[happy,setHappy]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  function greet(){setHappy(true);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setHappy(false),1800);}
  return <div className="buddy-greeting" data-cheering={happy?"true":"false"}>
    <div className="buddy-speech" aria-live="polite">{t(happy?"We can do this together!":"Hi! I’m Kiki.")}</div>
    <button type="button" className="buddy-button" aria-label={t("Say hello to Kiki")} onClick={greet}><BuddyArt/></button>
    <span className="buddy-caption">{t("Tap to say hi")}</span>
  </div>;
}
