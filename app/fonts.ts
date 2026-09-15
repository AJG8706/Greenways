import localFont from "next/font/local";

// Self-hosted per CLAUDE.md: fonts must render offline in the field.
// Zilla Slab 600/700 (display serif), Atkinson Hyperlegible Next 400–800 (UI, variable).
export const zillaSlab = localFont({
  src: [
    { path: "./fonts/zilla-slab-600-latin.woff2", weight: "600", style: "normal" },
    { path: "./fonts/zilla-slab-600-latin-ext.woff2", weight: "600", style: "normal" },
    { path: "./fonts/zilla-slab-700-latin.woff2", weight: "700", style: "normal" },
    { path: "./fonts/zilla-slab-700-latin-ext.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-zilla-slab",
  display: "swap",
  fallback: ["Rockwell", "Roboto Slab", "Georgia", "serif"],
});

export const atkinsonHyperlegibleNext = localFont({
  src: [
    {
      path: "./fonts/atkinson-hyperlegible-next-var-latin.woff2",
      weight: "400 800",
      style: "normal",
    },
    {
      path: "./fonts/atkinson-hyperlegible-next-var-latin-ext.woff2",
      weight: "400 800",
      style: "normal",
    },
  ],
  variable: "--font-atkinson",
  display: "swap",
  fallback: ["Atkinson Hyperlegible", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
