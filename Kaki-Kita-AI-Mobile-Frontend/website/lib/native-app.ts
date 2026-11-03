declare global {interface Window {KakiKitaNative?:{postMessage:(message:string)=>void}}}
export function printPage(){if(window.KakiKitaNative)window.KakiKitaNative.postMessage(JSON.stringify({action:"print"}));else window.print();}
export function saveNativeReport(name:string,data:string){if(!window.KakiKitaNative)return false;window.KakiKitaNative.postMessage(JSON.stringify({action:"save_json",name,data}));return true;}
