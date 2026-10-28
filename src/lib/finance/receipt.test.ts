import { describe, expect, it } from "vitest";
import { fitWithin, isPdf, receiptPath } from "./receipt";

describe("receipts", () => {
  it("shrinks big photos to fit, keeping the shape, and never enlarges", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ w: 1600, h: 1200 });
    expect(fitWithin(3024, 4032, 1600)).toEqual({ w: 1200, h: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ w: 800, h: 600 });
  });

  it("files receipts under the team and the Walkoff", () => {
    expect(receiptPath("t", "e", "f", "image/jpeg")).toBe("t/e/f.jpg");
    expect(receiptPath("t", "e", "f", "application/pdf")).toBe("t/e/f.pdf");
    expect(isPdf("t/e/f.PDF")).toBe(true);
    expect(isPdf("t/e/f.jpg")).toBe(false);
  });
});
