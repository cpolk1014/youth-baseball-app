import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/", "/join/", "/demo", "/t/", "/admin"] },
    sitemap: "https://www.fungo.team/sitemap.xml",
  };
}
