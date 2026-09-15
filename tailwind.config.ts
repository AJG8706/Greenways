import type { Config } from "tailwindcss";
import preset from "./phase1/src/tailwind.preset.js";

const config: Config = {
  // The Phase 1 preset is plain JS; its fontSize tuples don't line up with
  // Tailwind's stricter TS tuple types, hence the unknown hop.
  presets: [preset as unknown as Partial<Config>],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // shadcn/ui variable contract, resolved from Greenways semantic tokens in globals.css
      colors: {
        background: "var(--bg)",
        foreground: "var(--text)",
        card: { DEFAULT: "var(--bg-3)", foreground: "var(--text)" },
        popover: { DEFAULT: "var(--bg-3)", foreground: "var(--text)" },
        primary: { DEFAULT: "var(--btn-bg)", foreground: "var(--btn-text)" },
        secondary: { DEFAULT: "var(--bg-2)", foreground: "var(--text)" },
        muted: { DEFAULT: "var(--bg-2)", foreground: "var(--text-2)" },
        accent: { DEFAULT: "var(--bg-2)", foreground: "var(--text)" },
        destructive: {
          DEFAULT: "var(--error)",
          foreground: "var(--gw-prairie-cream)",
        },
        border: "var(--line)",
        input: "var(--line)",
        ring: "var(--focus)",
      },
      borderRadius: {
        lg: "16px",
        md: "10px",
        sm: "6px",
      },
    },
  },
  plugins: [],
};

export default config;
