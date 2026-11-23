import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { DEMO_AI_OFF } from "@/lib/demo/guest";
import { beginAi } from "./ledger.server";

const client = (isAnonymous: boolean) => {
  const rpc = vi.fn(async () => ({ data: "reservation-id", error: null }));
  const sb = {
    auth: { getClaims: async () => ({ data: { claims: { is_anonymous: isAnonymous } } }) },
    rpc,
  } as unknown as SupabaseClient;
  return { sb, rpc };
};

describe("beginAi", () => {
  it("turns guests in the demo club away before reserving anything", async () => {
    const { sb, rpc } = client(true);
    const r = await beginAi(sb, { teamId: "t1" }, "rules");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(402);
      expect(await r.response.json()).toEqual({ error: DEMO_AI_OFF });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reserves the call for everyone else", async () => {
    const { sb, rpc } = client(false);
    const r = await beginAi(sb, { teamId: "t1" }, "rules");
    expect(r.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("ai_reserve", { p_team: "t1", p_club: null, p_kind: "rules" });
  });
});
