const CACHE = "streaklab-static-v1";
const FILES = [ "/", "/index.html", "/styles.css", "/script.js", "/manifest.json" ];
self.addEventListener("install", (e)=> {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
