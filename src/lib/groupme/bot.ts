import { ChannelError, type TeamChannel } from "./channel";
import { splitMessage } from "./messages";

const BOT_POST_URL = "https://api.groupme.com/v3/bots/post";

/** A GroupMe bot posts into the one group it was created in. Server-side only. */
export function groupMeBot(botId: string, fetchImpl: typeof fetch = fetch): TeamChannel {
  return {
    async post(text: string) {
      // GroupMe caps a message at 1,000 characters; longer ones go as several, in order.
      for (const part of splitMessage(text)) {
        let res: Response;
        try {
          res = await fetchImpl(BOT_POST_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bot_id: botId, text: part }),
          });
        } catch {
          throw new ChannelError("Couldn't reach GroupMe. Try again in a minute.");
        }
        if (res.status === 404) {
          throw new ChannelError(
            "GroupMe doesn't recognize this Bot ID. Check it on dev.groupme.com/bots, or connect the bot again.",
            400,
          );
        }
        if (!res.ok) throw new ChannelError(`GroupMe said no (error ${res.status}). Try again.`);
      }
    },
  };
}

/** GroupMe bot IDs are letters and numbers (usually 26). */
export function isBotId(text: string): boolean {
  return /^[A-Za-z0-9]{10,64}$/.test(text);
}
