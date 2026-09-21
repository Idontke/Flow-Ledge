const CACHE_NAME = "flowledger-shell-v3";
const APP_SHELL = ["/offline.html", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png", "/apple-splash-1320x2868.png", "/apple-splash-1290x2796.png", "/apple-splash-1206x2622.png", "/apple-splash-1179x2556.png", "/apple-splash-1170x2532.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await cache.addAll(APP_SHELL);
    try {
      const shell = await fetch("/", { cache: "reload" });
      if (shell.ok) await cache.put("/", shell);
    } catch {
      // The static shell still installs when the first document fetch is unavailable.
    }
  }).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    const networkUpdate = fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put("/", response.clone());
      }
      return response;
    });
    event.respondWith(caches.match("/").then((cached) => cached || networkUpdate).catch(() => caches.match("/offline.html")));
    if (event.waitUntil) event.waitUntil(networkUpdate.catch(() => undefined));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});
