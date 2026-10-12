// Offline cache. Data a stránky: nejdřív síť (vždy čerstvé otázky), bez signálu z cache.
// Ostatní soubory (ikony, js): z cache a na pozadí aktualizovat.
const CACHE = "kvizb-20261012152655";
const FILES = ["./", "index.html", "app.js", "questions.json", "prehled.html",
               "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const fresh = /\.(json|html|js)$/.test(url.pathname) || url.pathname.endsWith("/");
  e.respondWith(caches.open(CACHE).then(async cache => {
    if (fresh) {
      try {
        const r = await fetch(e.request, { cache: "no-cache" });
        if (r.ok) cache.put(e.request, r.clone());
        return r;
      } catch (err) {
        return (await cache.match(e.request, { ignoreSearch: true })) || Response.error();
      }
    }
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
