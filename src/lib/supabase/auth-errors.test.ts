import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "./auth-errors";

describe("sign-in error messages", () => {
  it("explains an expired or used code", () => {
    expect(
      signInErrorMessage({
        code: "otp_expired",
        status: 403,
        message: "Token has expired or is invalid",
      }),
    ).toMatch(/expired or was already used/);
    expect(signInErrorMessage({ message: "Token has expired or is invalid" })).toMatch(
      /Send a new code/,
    );
  });

  it("explains rate limits and connection problems", () => {
    expect(signInErrorMessage({ code: "over_email_send_rate_limit", message: "x" })).toMatch(
      /Wait a minute/,
    );
    expect(signInErrorMessage({ status: 429, message: "x" })).toMatch(/Wait a minute/);
    expect(signInErrorMessage({ message: "Failed to fetch" })).toMatch(/connection/);
  });

  it("passes anything else through", () => {
    expect(signInErrorMessage({ message: "Signups not allowed" })).toBe(
      "That didn't work: Signups not allowed",
    );
  });
});
