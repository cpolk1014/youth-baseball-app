import { ImageResponse } from "next/og";
import { AppIconArt } from "./icon-art";

// Home-screen and manifest icons: /icon/192 and /icon/512.
export function generateImageMetadata() {
  return [192, 512].map((n) => ({
    id: String(n),
    size: { width: n, height: n },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const size = Number(await id);
  return new ImageResponse(<AppIconArt size={size} />, { width: size, height: size });
}
