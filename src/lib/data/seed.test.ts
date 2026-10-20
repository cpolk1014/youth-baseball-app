import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SEED_DATA } from "./seed";

describe("local seed data", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/seed.sql"), "utf8");

  it("matches supabase/seed.sql players (id, name, jersey, flags)", () => {
    for (const p of SEED_DATA.players) {
      const row = new RegExp(
        `'${p.id}', '[^']+', '${p.name}', ${p.jerseyNumber}, '\\{${p.preferredPositions.join(",")}\\}', ${p.canPitch}, ${p.canCatch}\\)`,
      );
      expect(sql, p.name).toMatch(row);
    }
  });

  it("matches supabase/seed.sql games", () => {
    for (const g of SEED_DATA.games) {
      expect(sql).toContain(`'${g.id}'`);
      expect(sql).toContain(`'${g.date}', '${g.startTime}', '${g.opponent}'`);
    }
  });
});
