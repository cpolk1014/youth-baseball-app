import type { MetadataRoute } from "next";

// Lets coaches add the app to their home screen; it opens full screen like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dugout Lineups",
    short_name: "Dugout",
    description: "Fair inning-by-inning lineups for youth travel baseball.",
    start_url: "/games",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f5f8",
    theme_color: "#0b1f3a",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
