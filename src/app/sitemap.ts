import type { MetadataRoute } from "next";

const BASE = "https://www.rallycap.team";
const PAGES: [string, number][] = [
  ["/", 1],
  ["/ai", 0.9],
  ["/features", 0.9],
  ["/pricing", 0.9],
  ["/clubs", 0.8],
  ["/parents", 0.8],
  ["/story", 0.6],
  ["/privacy", 0.3],
  ["/terms", 0.3],
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(([path, priority]) => ({ url: `${BASE}${path}`, priority }));
}
