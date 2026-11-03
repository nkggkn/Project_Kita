// Keep private photos, reports and workspace responses out of offline caches.
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("fetch",event=>{
  if(event.request.mode!=="navigate")return;
  event.respondWith(fetch(event.request).catch(()=>new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kaki Kita AI</title><style>body{font:20px system-ui;background:#ffffff;color:#203752;padding:32px;line-height:1.7}button{font:inherit;padding:16px 24px;background:#2258a6;color:white;border:0;border-radius:12px}main{max-width:480px;margin:15vh auto}</style><main><h1>No internet connection</h1><p>Connect to the internet, then try again.</p><button onclick="location.reload()">Try again</button></main></html>`,{status:503,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}})));
});
