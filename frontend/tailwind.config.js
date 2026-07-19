/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#04060a",
          900: "#070a10",
          800: "#0b1018",
          700: "#111826",
        },
        emerald: { glow: "#10b981" },
        teal: { glow: "#14b8a6" },
        cyan: { glow: "#22d3ee" },
        electric: "#3b82f6",
        violet: { glow: "#8b5cf6" },
        gold: "#f5d580",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ['"Clash Display"', '"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        xl2: "1.25rem",
        xl3: "1.75rem",
      },
      boxShadow: {
        glass: "0 8px 40px -12px rgba(0,0,0,0.55), inset 0 1px 0 0 rgba(255,255,255,0.06)",
        glow: "0 0 0 1px rgba(20,184,166,0.25), 0 8px 40px -8px rgba(20,184,166,0.35)",
        "glow-lg": "0 0 60px -12px rgba(34,211,238,0.5)",
      },
      keyframes: {
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "100%": { transform: "translateX(200%)" },
        },
        auroraShift: {
          "0%,100%": { transform: "translate3d(0,0,0) rotate(0deg) scale(1)" },
          "33%": { transform: "translate3d(4%,-3%,0) rotate(8deg) scale(1.1)" },
          "66%": { transform: "translate3d(-3%,4%,0) rotate(-6deg) scale(1.05)" },
        },
        spinSlow: { to: { transform: "rotate(360deg)" } },
        pulseRing: {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
      },
      animation: {
        floaty: "floaty 6s ease-in-out infinite",
        shimmer: "shimmer 2.2s ease-in-out infinite",
        aurora: "auroraShift 22s ease-in-out infinite",
        "spin-slow": "spinSlow 1s linear infinite",
        "pulse-ring": "pulseRing 2.4s ease-out infinite",
      },
    },
  },
  plugins: [],
};
