import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cloud: "#F7FBFF",
        plum: "#24162F",
        coral: "#FF6B5E",
        cyan: "#22D3EE",
        evidence: "#2563EB",
        apricot: "#FFD166",
        mint: "#7AE7C7",
        raspberry: "#D90368",
        slate: "#6D5A7D",
        mist: "#DCE9F2",
        lilac: "#F2E9FF",
        deeptext: "#171321",
      },
      fontFamily: {
        serif: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-plex-sans)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
