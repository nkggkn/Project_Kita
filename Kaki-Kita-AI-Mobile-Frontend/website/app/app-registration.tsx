"use client";
import { useEffect } from "react";
export default function AppRegistration(){
  useEffect(()=>{if("serviceWorker" in navigator&&location.protocol==="https:")void navigator.serviceWorker.register("/service-worker.js").catch(()=>{});},[]);
  return null;
}
