"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, CheckCheck, Film, FolderOpen, ImagePlus, LoaderCircle, RefreshCw, ScanLine } from "lucide-react";
import { callApi } from "@/lib/client-api";
import { canContinueCapture, captureFileError } from "@/lib/capture-flow";
import { videoFrames } from "@/lib/media-input";
import EasyRoomPoints from "./easy-room-points";
import { useLanguage } from "./language-provider";

type Room = {id:string;name:string};
type Result = {analyzedAt:string;samples:{seconds:number|null;result:{analysis?:Record<string,unknown>;claude?:Record<string,unknown>;gemini?:Record<string,unknown>;yolo:{detections:{label:string;confidence:number}[];annotated_image_base64?:string}}}[]};
type Saved = {id:string;roomId:string;roomName:string};
export default function CaptureGuide({video,rooms,connected,onWorking,onDirty,onSaved,onOpen,onNavigate}:{
  video:boolean;rooms:Room[];connected:boolean;onWorking:(message:string)=>void;onDirty:(value:boolean)=>void;
  onSaved:()=>Promise<void>;onOpen:(roomId:string,mediaId?:string)=>void;onNavigate:(view:string)=>void;
}) {
  const {t}=useLanguage(),kind=video?"video":"photo";
  const [step,setStep]=useState(1),[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState("");
  const [roomId,setRoomId]=useState(rooms[0]?.id||""),[roomName,setRoomName]=useState(""),[saved,setSaved]=useState<Saved|null>(null);
  const [result,setResult]=useState<Result|null>(null),[sample,setSample]=useState(0),[busy,setBusy]=useState(""),[error,setError]=useState(""),[verified,setVerified]=useState(false);
  const gallery=useRef<HTMLInputElement>(null),camera=useRef<HTMLInputElement>(null),title=useRef<HTMLHeadingElement>(null),locked=useRef(false);
  useEffect(()=>{if(!file){setPreview("");return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
  useEffect(()=>{title.current?.focus({preventScroll:true});window.scrollTo({top:0,behavior:"auto"});},[step]);
  useEffect(()=>{onDirty(!!busy||!!file&&!saved);return()=>onDirty(false);},[busy,file,saved,onDirty]);
  useEffect(()=>{onWorking(busy);return()=>onWorking("");},[busy,onWorking]);
  useEffect(()=>{function warn(event:BeforeUnloadEvent){if(busy||file&&!saved){event.preventDefault();event.returnValue="";}}window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[busy,file,saved]);
  function choose(next?:File) {
    if(!next||locked.current)return;
    const message=captureFileError(next,kind);if(message){setError(message);return;}
    setFile(next);setSaved(null);setResult(null);setSample(0);setError("");
  }
  async function save() {
    if(locked.current || !canContinueCapture(2,file,roomId,roomName,saved?.id||"",!!result))return;
    if(saved){setStep(3);return;}
    locked.current=true;setBusy("Saving…");setError("");
    try {
      let id=roomId;
      if(!id){const room=await callApi<{id:string}>("/rooms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:roomName.trim(),type:"Other",location:"",area:"",notes:"",checklist:Array(5).fill("Not checked")})});id=room.id;setRoomId(id);await onSaved();}
      const media=await callApi<{id:string}>(`/rooms/${id}/media?name=${encodeURIComponent(file!.name)}`,{method:"POST",headers:{"Content-Type":file!.type},body:file});
      setSaved({id:media.id,roomId:id,roomName:rooms.find(room=>room.id===id)?.name||roomName.trim()});
      await onSaved();setStep(3);
    }catch(e){setError(e instanceof Error?e.message:"Please try again.");}
    finally{setBusy("");locked.current=false;}
  }
  async function check() {
    if(!saved||locked.current)return;locked.current=true;setError("");setBusy(video?"Checking video…":"Checking photo…");
    try{
      const body=video?await videoFrames(saved.id):undefined;
      const report=await callApi<Result>(`/media/${saved.id}/analyze`,{method:"POST",body});
      setResult(report);setSample(0);setStep(4);await onSaved();
    }catch(e){setError(e instanceof Error?e.message:"Please try again.");}
    finally{setBusy("");locked.current=false;}
  }
  async function testConnection(){if(locked.current)return;locked.current=true;setBusy("Checking connection…");setError("");try{await callApi("/health");setVerified(true);}catch{setError("The room checker is unavailable. Your saved photo or video is safe. Please try again later.");}finally{setBusy("");locked.current=false;}}
  function restart(){setStep(1);setFile(null);setSaved(null);setResult(null);setError("");setSample(0);}
  const titles=video?["Please record a video or choose from gallery","Is this the right video?","Ready to check your video?","Your video results"]:["Please take a photo or choose from gallery","Is this the right photo?","Ready to check your photo?","Your room results"];
  const active=result?.samples[sample],analysis=active?.result.analysis||active?.result.claude||active?.result.gemini||{};
  const objects=Array.from(new Set((active?.result.yolo.detections||[]).map(item=>item.label.charAt(0).toUpperCase()+item.label.slice(1))));
  const canNext=canContinueCapture(step,file,roomId,roomName,saved?.id||"",!!result);
  return <section className="capture-guide" data-tour={video?"watch":"vision"} aria-label={video?"Kita Watch steps":"Kita Vision steps"}>
    <header className="guide-heading"><span>{video?<Film size={23}/>:<ScanLine size={23}/>} {video?"Kita Watch":"Kita Vision"}</span><p>{t("One step at a time.")}</p></header>
    <ol className="guide-progress" aria-label={t("Progress")}>{["Choose","Review","Check","Results"].map((label,index)=><li key={label} aria-current={step===index+1?"step":undefined} className={step===index+1?"current":step>index+1?"complete":""}><span>{step>index+1?<Check size={18}/>:index+1}</span><small>{t(label)}</small></li>)}</ol>
    <div className="guide-card"><p className="guide-step">{t("Step")} {step}/4</p><h1 ref={title} tabIndex={-1}>{t(titles[step-1])}</h1>
      {error&&<p className="alert error" role="alert">{t(error)}</p>}
      {busy&&<p className="guide-wait" role="status"><LoaderCircle className="spin" size={24}/>{t(busy)}<small>{t("Please keep this screen open.")}</small></p>}
      {step===1&&<><p className="guide-instruction">{t(video?"Show the room slowly. Keep the camera steady.":"Show the whole room. Keep the camera steady.")}</p><div className="guide-choices"><button className="guide-choice" disabled={!!busy} onClick={()=>camera.current?.click()}>{video?<Film size={34}/>:<Camera size={34}/>}<strong>{t(video?"Record a video":"Take a photo")}</strong></button><button className="guide-choice" disabled={!!busy} onClick={()=>gallery.current?.click()}><ImagePlus size={34}/><strong>{t("Choose from gallery")}</strong></button></div><input ref={gallery} className="sr-only" type="file" aria-label={video?"Choose video from gallery":"Choose photo from gallery"} accept={video?"video/mp4,video/webm,video/quicktime,video/x-msvideo,.mov,.avi":"image/jpeg,image/png,image/webp"} onChange={event=>{choose(event.target.files?.[0]);event.target.value="";}}/><input ref={camera} className="sr-only" type="file" aria-label={video?"Record room video":"Take room photo"} accept={video?"video/*":"image/*"} capture="environment" onChange={event=>{choose(event.target.files?.[0]);event.target.value="";}}/>{file?<div className="guide-picked"><CheckCheck size={22}/><span>{file.name}<small>{t("Ready. Tap Next to continue.")}</small></span></div>:<p className="guide-pause">{t(video?"Choose a video to continue.":"Choose a photo to continue.")}</p>}<small className="guide-limits">{t(video?"Videos up to 25 MB":"Photos up to 12 MB")}</small></>}
      {step===2&&<><p className="guide-instruction">{t("Check the picture, then choose a room.")}</p><div className="guide-preview">{video?<video controls playsInline preload="metadata" src={preview}/>:<img src={preview} alt={t("Your selected room photo")}/>}</div>{saved?<p className="guide-picked"><CheckCheck size={22}/>{t("Saved in")}: {saved.roomName}</p>:<><label className="guide-field">{t("Room")}<select value={roomId} onChange={event=>setRoomId(event.target.value)} disabled={!!busy}><option value="">{t("Add a room")}</option>{rooms.map(room=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label>{!roomId&&<label className="guide-field">{t("Room name")}<input value={roomName} maxLength={100} placeholder={t("For example: Living room")} onChange={event=>setRoomName(event.target.value)} disabled={!!busy}/></label>}</>}<p className="guide-pause">{t("Tap Next when you are ready.")}</p></>}
      {step===3&&<><div className="guide-ready"><CheckCheck size={36}/><strong>{t("Saved")}</strong><p>{saved?.roomName}</p></div><p className="guide-instruction">{t(video?"We will check 3 pictures from your video.":"We will look for items in your photo.")}</p><p className="guide-pause">{t("Nothing starts until you tap Check.")}</p>{!(connected||verified)&&<div className="guide-unavailable"><p>{t("The room checker needs a connection.")}</p><button className="button secondary" onClick={testConnection} disabled={!!busy}><RefreshCw size={20}/>{t("Try connection")}</button></div>}<p className="guide-small">{t(video?"Only 3 frames are checked. This is not a live safety monitor.":"Your photo is sent to the room checker for analysis.")}</p></>}
      {step===4&&result&&saved&&<><p className="guide-instruction">{t("Look at the room yourself before moving anything.")}</p>{!video?<div className="guide-preview"><img src={`/api/media/${saved.id}/file`} alt={file?.name||t("Room")}/></div>:<><div className="guide-preview"><video controls playsInline src={`/api/media/${saved.id}/file`}/></div><div className="guide-frame-tabs" aria-label={t("Video frames")}>{result.samples.map((frame,index)=><button key={index} aria-pressed={sample===index} onClick={()=>setSample(index)}>{t("Picture")} {index+1}{frame.seconds!==null&&<small>{frame.seconds.toFixed(1)}s</small>}</button>)}</div>{active?.result.yolo.annotated_image_base64&&/^[a-zA-Z0-9+/=\r\n]+$/.test(active.result.yolo.annotated_image_base64)&&<img className="guide-annotated" src={`data:image/jpeg;base64,${active.result.yolo.annotated_image_base64}`} alt={t("Items found in this picture")}/>}</>}<EasyRoomPoints analysis={analysis} detections={active?.result.yolo.detections||[]}/><h2>{t("Items found")}</h2>{objects.length?<ul className="guide-object-list">{objects.map(label=><li key={label}>{t(label)}</li>)}</ul>:<p>{t("No items found. You can add items in My tasks.")}</p>}<div className="guide-result-actions"><a className="button primary" href={`/checklist?media=${encodeURIComponent(saved.id)}`}><CheckCheck size={22}/>{t("Make my checklist")}</a><button className="button secondary" onClick={()=>onOpen(saved.roomId,saved.id)}><FolderOpen size={22}/>{t("View full report")}</button></div><p className="guide-small">{t("AI can miss items. Check the room yourself.")}</p></>}
      <div className="guide-actions">{step>1&&step<4?<button className="button secondary" disabled={!!busy} onClick={()=>{setError("");setStep(step-1);}}><ArrowLeft size={20}/>{t("Back")}</button>:<button className="button secondary" disabled={!!busy} onClick={()=>onNavigate("home")}><ArrowLeft size={20}/>{t("Home")}</button>}{step===1||step===2?<button className="button primary" disabled={!canNext||!!busy} onClick={()=>{setError("");if(step===1)setStep(2);else void save();}}>{t("Next")}<ArrowRight size={21}/></button>:step===3?<button className="button primary" disabled={!canNext||!!busy||!(connected||verified)} onClick={check}>{busy?<LoaderCircle className="spin" size={21}/>:<ScanLine size={21}/>} {t(video?"Check video":"Check photo")}</button>:<button className="button primary" disabled={!!busy} onClick={restart}>{t(video?"Check another video":"Check another room")}<ArrowRight size={21}/></button>}</div>
    </div>
  </section>;
}
