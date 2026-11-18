/**
 * What went wrong with a sign-in code or email, in words a parent can act on. `step` is
 * "send" (emailing the code) or "verify" (checking the code typed in): only a code can be
 * mistyped or expired, so a failed send never blames the code.
 */
export function signInErrorMessage(
  error: { code?: string; status?: number; message: string },
  step: "send" | "verify" = "verify",
): string {
  const msg = error.message.toLowerCase();
  if (
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit" ||
    error.status === 429
  ) {
    return "Too many tries in a row. Wait a minute, then send a new code.";
  }
  if (msg.includes("fetch") || msg.includes("network")) {
    return "Couldn't reach RallyCap. Check your connection and try again.";
  }
  if (step === "send") {
    return `We couldn't send your code (${error.message}). Try again in a minute; if it keeps happening, let us know.`;
  }
  if (error.code === "otp_expired" || msg.includes("expired") || msg.includes("invalid")) {
    return "That code's a swing and a miss. It may be mistyped, used already, or replaced by a newer one. Check the newest email and try again, or tap “Send a new code”.";
  }
  return `That didn't work: ${error.message}`;
}

/**
 * Seconds Supabase says to wait before sending another email ("…you can only request this
 * after 42 seconds."), or null if the error isn't that.
 */
export function retryAfterSeconds(error: { message: string }): number | null {
  const m = /after (\d+) seconds?/i.exec(error.message);
  return m ? Number(m[1]) : null;
}
