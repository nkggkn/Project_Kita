"use client";
import { roomPoints } from "@/lib/room-points";
import { useLanguage } from "./language-provider";
export default function EasyRoomPoints({analysis,detections}:{analysis:Record<string,unknown>;detections:{label:string}[]}){
  const {t}=useLanguage();
  return <section className="easy-room-points" aria-label={t("Quick points")}><h2>{t("Quick points")}</h2><ul>{roomPoints(analysis,detections).map((point,index)=><li key={index}><span className="point-bullet" aria-hidden="true">•</span><span>{point.startsWith("Items: ")?<>{t("Items found")}: {point.slice(7,-1).split(", ").map(name=>t(name.charAt(0).toUpperCase()+name.slice(1))).join(", ")}</>:t(point)}</span></li>)}</ul><p>{t("AI can miss things. Check the room yourself.")}</p></section>;
}
