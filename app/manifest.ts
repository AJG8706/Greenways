import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Greenways",
    short_name: "Greenways",
    description: "Walk the land. Find every corner. — by Texas Greener Pastures",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#24301F",
    theme_color: "#24301F",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/brand/greenways-app-icon-1024.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
