import type { MetadataRoute } from "next";

// Lets coaches add the app to their home screen; it opens full screen like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RallyCap",
    short_name: "RallyCap",
    description:
      "Run your travel baseball team: fair lineups, lineup cards, and season playing time.",
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
