const CACHE="chand-enterprises-v2";
const APP_SHELL=["/","/static/style.css","/static/responsive.css","/static/app.js","/static/location.js","/static/manifest.webmanifest"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET" || new URL(e.request.url).origin!==self.location.origin) return;
  const path=new URL(e.request.url).pathname;
  if(path.startsWith("/api/") || path.startsWith("/admin/") || path==="/logout" || path==="/dashboard" || path==="/staff") return;
  e.respondWith(fetch(e.request).then(res=>{
    if(res.ok){ const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); }
    return res;
  }).catch(()=>caches.match(e.request).then(x=>x||caches.match("/"))));
});
