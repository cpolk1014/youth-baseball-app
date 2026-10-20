import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "./config";

describe("supabase seed", () => {
  it("seeds the season with the same rules as DEFAULT_RULE_CONFIG", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/seed.sql"), "utf8");
    const json = sql.match(/'(\{\s*"fieldPositions"[\s\S]*?\})'/)?.[1];
    expect(json).toBeDefined();
    // Severities aren't seeded; they come from the defaults.
    expect({ ...JSON.parse(json!), severity: DEFAULT_RULE_CONFIG.severity }).toEqual(
      DEFAULT_RULE_CONFIG,
    );
  });
});
