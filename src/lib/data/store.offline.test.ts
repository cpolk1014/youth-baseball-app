import { beforeEach, describe, expect, it, vi } from "vitest";
import { lineupFromGrid } from "@/lib/rules/test-utils";
import { SEED_DATA } from "./seed";

// The store signed in (Supabase mode) with the network simulated: online, offline, and a
// server that refuses a change. Each test loads a fresh store over the same device storage.

const backend = {
  online: true,
  refuse: null as string | null,
  saved: [] as string[],
};
const network = () => {
  if (!backend.online) throw new Error("TypeError: Failed to fetch");
};

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: true,
  supabaseUrl: "https://example.test",
  supabaseAnonKey: "anon",
}));
vi.mock("./supabase-backend", () => ({
  loadFromSupabase: vi.fn(async () => {
    network();
    return { kind: "ready", data: SEED_DATA, email: "coach@example.test", teamId: "t" };
  }),
  saveLineupRpc: vi.fn(async (gameId: string) => {
    network();
    if (backend.refuse) throw new Error(backend.refuse);
    backend.saved.push(`lineup:${gameId}`);
  }),
  saveGameResult: vi.fn(async (gameId: string) => {
    network();
    backend.saved.push(`result:${gameId}`);
  }),
  saveGameStatus: vi.fn(async () => network()),
  savePlayerRow: vi.fn(async () => {
    network();
    backend.saved.push("player");
  }),
}));

// A browser-ish device: storage that survives reloads, and connectivity.
const storage = new Map<string, string>();
const device = {
  onLine: true,
};
vi.stubGlobal("navigator", {
  get onLine() {
    return device.onLine;
  },
});
vi.stubGlobal("window", {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  },
  addEventListener: () => {},
  setInterval: () => 0,
  dispatchEvent: () => true,
  confirm: () => true,
});
vi.stubGlobal("document", { addEventListener: () => {}, visibilityState: "visible" });

type Store = typeof import("./store");

/** Open the app: a fresh store that loads the team (from the server or the device copy). */
async function openApp(): Promise<Store> {
  vi.resetModules();
  const store = await import("./store");
  store.reloadData();
  await waitFor(() => store.getStoreState().status.kind !== "loading");
  return store;
}

const readState = (store: Store) => store.getStoreState();

async function waitFor(cond: () => boolean, ms = 1000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

const game = SEED_DATA.games[0]!;
const lineup = lineupFromGrid({ [SEED_DATA.players[0]!.id]: ["P", "P", "C", "C"] });

describe("offline dugout use", () => {
  beforeEach(() => {
    storage.clear();
    backend.online = true;
    backend.refuse = null;
    backend.saved = [];
    device.onLine = true;
  });

  it("opens the device's copy of the team when there's no signal", async () => {
    await openApp(); // online once: the copy is kept
    backend.online = false;
    device.onLine = false;
    const store = await openApp();
    const s = readState(store);
    expect(s.status.kind).toBe("ready");
    expect(s.offline).toBe(true);
    expect(s.savedAt).not.toBeNull();
    expect(store.getAppData().players).toHaveLength(SEED_DATA.players.length);
  });

  it("without a device copy, no signal is an error", async () => {
    backend.online = false;
    device.onLine = false;
    const store = await openApp();
    expect(readState(store).status.kind).toBe("error");
  });

  it("saves lineups and scores on the device offline, and syncs them when signal returns", async () => {
    await openApp();
    backend.online = false;
    device.onLine = false;
    let store = await openApp();
    store.saveLineup(game.id, lineup);
    store.setGameResult(game.id, "final", 7, 4);
    await waitFor(() => readState(store).pending === 2);
    expect(store.getAppData().lineups[game.id]?.slots).toHaveLength(4);
    expect(backend.saved).toEqual([]);

    // The app is closed and opened again, still offline: the changes are still there.
    store = await openApp();
    expect(readState(store).pending).toBe(2);
    expect(store.getAppData().games[0]).toMatchObject({ status: "final", scoreUs: 7 });

    // Signal comes back.
    backend.online = true;
    device.onLine = true;
    expect(await store.syncNow()).toBe(true);
    expect(backend.saved).toEqual([`lineup:${game.id}`, `result:${game.id}`]);
    expect(readState(store)).toMatchObject({ pending: 0, offline: false });
  });

  it("refuses other edits offline instead of losing them", async () => {
    await openApp();
    backend.online = false;
    device.onLine = false;
    const store = await openApp();
    const before = store.getAppData().players[0]!;
    store.savePlayer({ ...before, name: "Renamed" });
    expect(store.getAppData().players[0]!.name).toBe(before.name);
    expect(readState(store).saveError).toMatch(/offline/i);
  });

  it("drops a change the server refuses, and says so", async () => {
    const store = await openApp();
    backend.refuse = "only a coach can save this lineup";
    store.saveLineup(game.id, lineup);
    await waitFor(() => readState(store).saveError !== null);
    expect(readState(store).pending).toBe(0);
    expect(readState(store).saveError).toMatch(/only a coach/);
  });
});
