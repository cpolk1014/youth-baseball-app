import { describe, expect, it } from "vitest";
import { ANNOUNCER_SETTINGS, announcerVoice, DEFAULT_ANNOUNCER_VOICE } from "./voice";

const ID = "AbCdEfGhIjKlMnOpQr12";

describe("announcerVoice", () => {
  it("uses the voice set in the env", () => {
    expect(announcerVoice(ID)).toEqual({ id: ID, fallback: null });
  });

  it("cleans spaces, line breaks and quotes off a pasted value", () => {
    for (const raw of [` ${ID} `, `${ID}\n`, `"${ID}"`, `'${ID}'`, ` "${ID}"\r\n`]) {
      expect(announcerVoice(raw)).toEqual({ id: ID, fallback: null });
    }
  });

  it("falls back to the default when unset or empty", () => {
    for (const raw of [undefined, "", "   ", '""']) {
      expect(announcerVoice(raw)).toEqual({ id: DEFAULT_ANNOUNCER_VOICE, fallback: "missing" });
    }
  });

  it("falls back, and says so, when the value isn't a voice id", () => {
    for (const raw of ["George", `${ID}x`, `${ID} extra`, "https://elevenlabs.io/voice"]) {
      expect(announcerVoice(raw)).toEqual({ id: DEFAULT_ANNOUNCER_VOICE, fallback: "malformed" });
    }
  });
});

describe("ANNOUNCER_SETTINGS", () => {
  it("keeps the voice steady enough not to drift", () => {
    expect(ANNOUNCER_SETTINGS.stability).toBeGreaterThanOrEqual(0.5);
    expect(ANNOUNCER_SETTINGS.style).toBeLessThanOrEqual(0.3);
  });
});
