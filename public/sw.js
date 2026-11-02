// RallyCap service worker: lets the app open in a dugout with no signal.
//
// - App code (/_next/static, fingerprinted): kept after first use, served from the device.
// - Pages: always fresh from the network when there's signal; the last copy when there isn't.
// - The app asks to "warm" pages it may need offline (Games and upcoming games).
// - Never touches API routes, sign-in, or other sites (Supabase, GroupMe).
// Team data itself lives in the app's own device copy, not here.

const VERSION = "v1";
const PAGES = `rallycap-pages-${VERSION}`;
const STATIC = `rallycap-static-${VERSION}`;

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline · RallyCap</title>
<style>body{font-family:system-ui,sans-serif;background:#f3f5f8;color:#0f172a;margin:0;padding:24px}
.c{max-width:420px;margin:15vh auto;background:#fff;border:2px solid #e2e8f0;border-radius:16px;padding:20px}
h1{font-size:22px;margin:0 0 8px}p{font-size:17px;line-height:1.4}
a{display:block;text-align:center;background:#0b1f3a;color:#fff;text-decoration:none;font-weight:700;
padding:16px;border-radius:12px;font-size:18px;margin-top:16px}</style></head><body><div class="c">
<h1>You're offline</h1><p>This page hasn't been opened on this device yet, so it isn't saved here.
Your games and lineups are.</p><a href="/games">Go to Games</a></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("rallycap-") && !key.endsWith(VERSION)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

const skip = (url) =>
  url.origin !== self.location.origin ||
  url.pathname.startsWith("/api/") ||
  url.pathname.startsWith("/auth") ||
  url.pathname.startsWith("/login") ||
  url.pathname.startsWith("/join") ||
  url.pathname === "/sw.js";

/** A real page for a signed-in user (not a redirect to sign-in or an error). */
const keepable = (res) =>
  res.ok && !res.redirected && (res.headers.get("content-type") || "").includes("text/html");

/** Weak signal: if the network is this slow and there's a saved copy, show the copy. */
const SLOW_MS = 4000;

async function fromNetworkOrCache(request, url) {
  const pages = await caches.open(PAGES);
  const cached = await pages.match(url.pathname);
  const network = fetch(request).then((res) => {
    if (keepable(res)) pages.put(url.pathname, res.clone());
    return res;
  });
  const offline = () =>
    cached ||
    new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (!cached) return network.catch(offline);
  const slow = new Promise((resolve) => setTimeout(() => resolve(cached), SLOW_MS));
  return Promise.race([network.catch(offline), slow]);
}

async function staticFirst(request) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (skip(url)) return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(fromNetworkOrCache(request, url));
  }
  // Everything else (in-app page data, prefetches) goes to the network as usual; when it
  // fails offline, the app falls back to a full page load, which is served above.
});

/** Save a page and the app code it needs, so it opens offline later. */
async function warm(path) {
  const pages = await caches.open(PAGES);
  if (await pages.match(path)) return;
  const res = await fetch(path, { credentials: "same-origin" });
  if (!keepable(res)) return;
  const html = await res.clone().text();
  await pages.put(path, res);
  const assets = new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) || []);
  const statics = await caches.open(STATIC);
  for (const asset of assets) {
    if (await statics.match(asset)) continue;
    try {
      const a = await fetch(asset);
      if (a.ok) await statics.put(asset, a);
    } catch {
      // Try again next time.
    }
  }
}

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "warm" && Array.isArray(msg.paths)) {
    event.waitUntil(
      (async () => {
        for (const path of msg.paths.slice(0, 60)) {
          if (typeof path !== "string" || !path.startsWith("/")) continue;
          try {
            await warm(path);
          } catch {
            // Offline or a bad page: skip it.
          }
        }
      })(),
    );
  }
});
