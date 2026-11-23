import Anthropic from "@anthropic-ai/sdk";
import { createHmac } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { claudeCents } from "@/lib/ai/cost";
import {
  ASK_DAY_CENTS,
  ASK_ERROR_TEXT,
  ASK_PER_VISITOR,
  ASK_SITE_LIMIT_TEXT,
  ASK_VISITOR_LIMIT_TEXT,
  cleanChat,
} from "@/lib/ask/chat";
import { ASK_GUIDE, ASK_SYSTEM } from "@/lib/ask/guide";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const maxDuration = 60;

const MODEL = "claude-sonnet-5-5";

/**
 * Who's asking, as a one-way hash of their address and today's date: enough to count a
 * visitor's questions today, useless for following anyone (it changes every day, and the
 * address itself is never stored).
 */
function visitorKey(request: NextRequest): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "ask-fungo")
    .update(`${ip}|${day}`)
    .digest("hex");
}

function text(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * Ask Fungo, the website's help chat (no sign-in). Answers from the Fungo guide, streamed as
 * plain text. Each visitor gets a few dozen questions a day and the site has a daily spend
 * cap; past either, it says to email support. Questions are kept without who asked.
 */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Ask Fungo isn't set up yet." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const chat = cleanChat(body?.chat);
  if (!chat.ok) return NextResponse.json({ error: chat.error }, { status: 400 });
  const page = typeof body?.page === "string" ? body.page.slice(0, 100) : null;
  const question = chat.turns.at(-1)!.text;

  const admin = getAdminSupabase();
  const settle = (cents: number, outcome: string) =>
    admin
      .rpc("ask_settle", { p_cents: cents, p_page: page, p_question: question, p_outcome: outcome })
      .then(({ error }) => {
        if (error) console.error("ask_settle failed", error.message);
      });

  const { data: verdict, error } = await admin.rpc("ask_reserve", {
    p_visitor: visitorKey(request),
    p_per_visitor: ASK_PER_VISITOR,
    p_day_cents: ASK_DAY_CENTS,
  });
  if (error) {
    console.error("ask_reserve failed", error.message);
    return text(ASK_ERROR_TEXT, 503);
  }
  if (verdict === "site") {
    await settle(0, "site_limit");
    return text(ASK_SITE_LIMIT_TEXT);
  }
  if (verdict === "visitor") {
    await settle(0, "visitor_limit");
    return text(ASK_VISITOR_LIMIT_TEXT);
  }

  const client = new Anthropic();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sent = false;
      try {
        const reply = client.beta.messages.stream({
          model: MODEL,
          max_tokens: 1500,
          // If the request is declined, retry on Anthropic's recommended fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low" },
          // One fixed block (rules + guide), cached between visitors' questions.
          system: [
            {
              type: "text",
              text: `${ASK_SYSTEM}\n\n${ASK_GUIDE}`,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: chat.turns.map((t) => ({ role: t.role, content: t.text })),
        });
        for await (const event of reply) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
            sent = true;
          }
        }
        const final = await reply.finalMessage();
        if (!sent) {
          controller.enqueue(
            encoder.encode(
              final.stop_reason === "refusal"
                ? "I can only help with questions about Fungo. Try asking about lineups, pricing or clubs."
                : ASK_ERROR_TEXT,
            ),
          );
        }
        await settle(claudeCents(final.model, final.usage), "answered");
      } catch (e) {
        console.error("Ask Fungo failed", e instanceof Error ? e.message : e);
        if (!sent) controller.enqueue(encoder.encode(ASK_ERROR_TEXT));
        await settle(0, "error");
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
