/** What went wrong with a sign-in code or email, in words a parent can act on. */
export function signInErrorMessage(error: {
  code?: string;
  status?: number;
  message: string;
}): string {
  const msg = error.message.toLowerCase();
  if (error.code === "otp_expired" || msg.includes("expired") || msg.includes("invalid")) {
    return "That code has expired or was already used. Each new email replaces the last code, and tapping the link in the email uses the code up. Tap “Send a new code” and type the newest one.";
  }
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
  return `That didn't work: ${error.message}`;
}
