/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Solstice Docs design tokens (Vesper brief, 2026-10-12)
        obsidian: "#0A0B0E",
        electric: "#3B82F6",
      },
      fontFamily: {
        // System font stack — no webfonts, local-first
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
