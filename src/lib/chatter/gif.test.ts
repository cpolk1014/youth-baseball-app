import { describe, expect, it } from "vitest";
import { gifFrom, gifFromGiphy, giphyLink } from "./gif";

const item = {
  id: "abc123",
  title: "Home Run GIF by MLB",
  images: {
    fixed_width: {
      mp4: "https://media2.giphy.com/media/v1.Y2lk/abc123/200w.mp4?cid=xyz&rid=200w.mp4&ct=g",
      width: "200",
      height: "150",
    },
    fixed_width_still: { url: "https://media2.giphy.com/media/v1.Y2lk/abc123/200w_s.gif?cid=xyz" },
  },
};

describe("GIFs", () => {
  it("keeps GIPHY links and drops their tracking query", () => {
    expect(giphyLink("https://media0.giphy.com/media/a/b.mp4?cid=1")).toBe(
      "https://media0.giphy.com/media/a/b.mp4",
    );
    expect(giphyLink("https://evil.example.com/a.mp4")).toBeNull();
    expect(giphyLink("http://media.giphy.com/a.mp4")).toBeNull();
    expect(giphyLink(3)).toBeNull();
  });

  it("turns a GIPHY result into a post's GIF", () => {
    expect(gifFromGiphy(item)).toEqual({
      id: "abc123",
      mp4: "https://media2.giphy.com/media/v1.Y2lk/abc123/200w.mp4",
      still: "https://media2.giphy.com/media/v1.Y2lk/abc123/200w_s.gif",
      w: 200,
      h: 150,
      title: "Home Run GIF by MLB",
    });
    expect(gifFromGiphy({ ...item, id: "bad id!" })).toBeNull();
    expect(gifFromGiphy({ id: "x", images: {} })).toBeNull();
    // No still frame: the animated GIF stands in.
    const noStill = gifFromGiphy({
      ...item,
      images: {
        fixed_width: {
          ...item.images.fixed_width,
          url: "https://media2.giphy.com/media/abc123/200w.gif",
        },
      },
    });
    expect(noStill?.still).toBe("https://media2.giphy.com/media/abc123/200w.gif");
  });

  it("reads a post's GIF back, and only from GIPHY", () => {
    const g = gifFromGiphy(item)!;
    expect(gifFrom(g)).toEqual(g);
    expect(gifFrom({ ...g, mp4: "https://evil.example.com/x.mp4" })).toBeNull();
    expect(gifFrom(null)).toBeNull();
  });
});
