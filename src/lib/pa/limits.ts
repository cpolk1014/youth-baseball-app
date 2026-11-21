// The kinds of AI clip Gameday PA makes. Their daily caps and the team's season AI budget
// live in the database's AI ledger (ai_cap, ai_reserve; supabase/migrations/*_ai_limits.sql).

export type GenerationKind = "song" | "announce" | "sound";
