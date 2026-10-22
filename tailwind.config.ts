import type { Config } from "tailwindcss";

// Design tokens for ProvKlura — se app/globals.css för CSS-variablerna.
// Känsla: fokus, frihet, framåt. "Klura ut provet." (moodboard-ombrandning)
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sand: {
          DEFAULT: "#E7D7B2", // bakgrund — sand
          deep: "#D4C093", // kant/divider — mörkare sand
        },
        navy: "#0E1114", // primärtext — kolsvart
        ocean: {
          DEFAULT: "#1D5D7A", // primära knappar/länkar — havsblå
          dark: "#154A63",
        },
        turquoise: "#2CC4C4", // sekundär accent — turkos
        seafoam: "#DCF3F0", // ljusa kort/ytor
        coral: {
          DEFAULT: "#FF6B4A", // call-to-action / highlight — korall
          dark: "#E0522F",
        },
        sun: "#F4B942", // framgång, guldmedalj, highlights
        alert: "#D7263D", // röd prick: något väntar på föräldern
        ink: {
          DEFAULT: "#5B4B9E", // Skrivklura — bläck: accent för skrivövningar
          dark: "#43377A",
          soft: "#EEEAF8",
        },
        press: {
          DEFAULT: "#B4235A", // Nutidskrysset — tidningsrött/hallon
          dark: "#8C1A45",
          soft: "#FBEAF0",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
        accent: ["var(--font-accent)", "cursive"],
      },
      borderRadius: {
        card: "1.25rem",
      },
      boxShadow: {
        card: "0 4px 0 0 rgba(14, 17, 20, 0.1)",
      },
    },
  },
  plugins: [],
};

export default config;
