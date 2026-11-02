import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Runs public/sw.js against a simulated network and cache: online, offline, weak signal,
// and saving pages ahead of time.

const ORIGIN = "https://www.rallycap.team";
const source = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");

type Handler = (event: Record<string, unknown>) => void;

function makeWorld() {
  const stores = new Map<string, Map<string, Response>>();
  const key = (r: Request | string) => (typeof r === "string" ? r : new URL(r.url).pathname);
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name)!;
      return {
        match: async (r: Request | string) => m.get(key(r))?.clone(),
        put: async (r: Request | string, res: Response) => void m.set(key(r), res),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const net = {
    online: true,
    delay: 0,
    pages: new Map<string, string>([
      ["/games", `<html><script src="/_next/static/chunks/app.js"></script>games</html>`],
      ["/games/g1", `<html><script src="/_next/static/chunks/app.js"></script>game 1</html>`],
    ]),
    fetched: [] as string[],
  };
  const fetch = async (input: Request | string) => {
    const path = key(input);
    net.fetched.push(path);
    if (net.delay) await new Promise((r) => setTimeout(r, net.delay));
    if (!net.online) throw new TypeError("Failed to fetch");
    if (path.startsWith("/_next/static/")) {
      return new Response("js", { headers: { "content-type": "text/javascript" } });
    }
    const html = net.pages.get(path);
    return html
      ? new Response(html, { headers: { "content-type": "text/html" } })
      : new Response("nope", { status: 404 });
  };
  const handlers: Record<string, Handler> = {};
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  new Function("self", "caches", "fetch", "location", source)(self, caches, fetch, self.location);

  /** A fetch event like the browser's; resolves with what the worker answered (or null). */
  const request = async (path: string, mode: RequestMode | "navigate" = "navigate") => {
    const reply: { answer: Promise<Response> | null } = { answer: null };
    handlers.fetch!({
      request: { url: ORIGIN + path, method: "GET", mode },
      respondWith: (p: Promise<Response>) => (reply.answer = p),
    });
    return reply.answer ? await reply.answer : null;
  };
  const message = async (data: unknown) => {
    let done: Promise<unknown> = Promise.resolve();
    handlers.message!({ data, waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  return { net, request, message, stores };
}

describe("service worker", () => {
  let w: ReturnType<typeof makeWorld>;
  beforeEach(() => {
    w = makeWorld();
  });

  it("serves pages fresh online and the saved copy offline", async () => {
    expect(await (await w.request("/games"))!.text()).toContain("games");
    w.net.online = false;
    expect(await (await w.request("/games"))!.text()).toContain("games");
  });

  it("shows a friendly page for a page never opened on this device", async () => {
    w.net.online = false;
    const res = await w.request("/games/never");
    expect(await res!.text()).toContain("You're offline");
  });

  it("falls back to the saved copy when the signal is too slow", async () => {
    vi.useFakeTimers();
    try {
      await w.request("/games"); // saved
      w.net.delay = 60_000;
      const pending = w.request("/games");
      await vi.advanceTimersByTimeAsync(4_100);
      expect(await (await pending)!.text()).toContain("games");
    } finally {
      vi.useRealTimers();
    }
  });

  it("saves pages and their app code ahead of time when asked", async () => {
    await w.message({ type: "warm", paths: ["/games/g1", "https://evil.example/x"] });
    w.net.online = false;
    expect(await (await w.request("/games/g1"))!.text()).toContain("game 1");
    const js = await w.request("/_next/static/chunks/app.js", "no-cors");
    expect(await js!.text()).toBe("js");
    expect(w.net.fetched).not.toContain("/x");
  });

  it("leaves API calls, sign-in and other requests alone", async () => {
    expect(await w.request("/api/pa/generate", "cors")).toBeNull();
    expect(await w.request("/login")).toBeNull();
    expect(await w.request("/games?_rsc=abc", "cors")).toBeNull();
  });

  it("doesn't keep a sign-in redirect or an error as a saved page", async () => {
    w.net.pages.delete("/games");
    await w.request("/games"); // 404
    w.net.online = false;
    expect(await (await w.request("/games"))!.text()).toContain("You're offline");
  });
});
