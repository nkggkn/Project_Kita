"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Camera, Check, ChevronDown, CircleHelp, Download, Sparkles, Wifi } from "lucide-react";
import { useLanguage } from "./language-provider";
import KitaBuddy from "./kita-buddy";
import { CalmMode } from "./playful-experience";

export default function LiveCameraGuide(){
  const {t,locale}=useLanguage();
  const [native,setNative]=useState(false),[opened,setOpened]=useState(false),[step,setStep]=useState(0);
  useEffect(()=>setNative(!!window.KakiKitaNative&&navigator.userAgent.includes("KakiKitaTapo/1")),[]);
  function open(){if(!native||!window.KakiKitaNative)return;window.KakiKitaNative.postMessage(JSON.stringify({action:"open_tapo",locale}));setOpened(true);}
  const steps=[
    {title:"Use the same Wi-Fi",hint:"Connect your phone and camera.",icon:Wifi},
    {title:"Connect your camera",hint:"Follow the steps in the Android app.",icon:Camera},
    {title:"See items live",hint:"Tap Stop when you finish.",icon:Check},
  ];
  return <section className="live-camera-guide watch-guide" aria-labelledby="live-camera-title">
    <div className="watch-hero">
      <div className="watch-orbit" aria-hidden="true"><i/><i/><Sparkles size={23}/></div>
      <header><span className="watch-buddy-tag"><Sparkles size={15} aria-hidden="true"/>{t("Your room buddy")}</span><h1 id="live-camera-title">{t("Watch your room")}</h1><p>{t("Simple live checks. One step at a time.")}</p></header>
      <KitaBuddy/>
    </div>
    <ol className="watch-step-list">{steps.map(({title,hint,icon:Icon},index)=><li key={title} data-active={step===index?"true":"false"}>
      <button type="button" aria-expanded={step===index} aria-controls={`watch-tip-${index}`} onClick={()=>setStep(current=>current===index?-1:index)}>
        <span className="watch-step-icon" aria-hidden="true"><Icon size={25}/><small>{index+1}</small></span>
        <strong>{t(title)}</strong><ChevronDown size={20} className="watch-step-chevron" aria-hidden="true"/>
      </button>
      <p id={`watch-tip-${index}`} hidden={step!==index}>{t(hint)}</p>
    </li>)}</ol>
    <div className="watch-launch">
      {native?<button className="button primary watch-open" type="button" onClick={open}><Camera size={24} aria-hidden="true"/><span>{t("Open camera")}</span><ArrowRight size={22} aria-hidden="true"/></button>:<><a className="button primary watch-open" href="/downloads/kaki-kita-android-test.apk?v=1.1.2" download><Download size={24} aria-hidden="true"/><span>{t("Install Android app")}</span><ArrowRight size={22} aria-hidden="true"/></a><p className="watch-install-note">{t("Install once. Open Watch in the app.")}</p></>}
      {opened&&<p role="status" className="watch-opened">{t("Follow the steps in the app.")}</p>}
    </div>
    <details className="watch-help"><summary><CircleHelp size={21} aria-hidden="true"/>{t("First setup")}<ChevronDown size={18} aria-hidden="true"/></summary><ol>{!native&&<li>{t("Install the Android app on your phone.")}</li>}<li>{t("Find your camera IP and camera account.")}</li><li>{t("Run your Colab notebook. Copy its URL and private live token.")}</li><li>{t("Enter these in the Android app. Keep passwords private.")}</li></ol><a href="https://www.tapo.com/us/faq/34/?app=web" target="_blank" rel="noreferrer">{t("Camera setup help")}</a></details>
    <div className="watch-calm"><CalmMode/></div>
    <p className="watch-footnote">{t("AI can miss things. Check the room yourself.")}</p>
  </section>;
}
