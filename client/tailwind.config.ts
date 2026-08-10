import type { Config } from "tailwindcss";

/**
 * ZamZam design system — v2.
 *
 * SIX colors carry the entire product (teal-900/700/100, amber-500, ink,
 * paper) plus a semantic status set. Nothing else is a legal fill color.
 * The discipline is the point: premium products are not maximalist, and a
 * palette that can't sprawl can't drift into looking templated.
 *
 * `amber-500` is THE accent and appears as a filled element exactly once
 * per screen — it means "act on this", never decoration. Two amber fills on
 * one screen is a bug: it means the screen hasn't decided what its primary
 * action is.
 *
 * Neutral SURFACES stay CSS variables (see styles/globals.css) so light/dark
 * resolve from one place; the brand hexes are literal here because they are
 * the identity and do not re-theme.
 */
const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1rem", sm: "1.5rem", lg: "2rem" },
      screens: { "2xl": "1360px" },
    },
    extend: {
      fontFamily: {
        // Display carries prices, times, route names, headlines — the things
        // the eye must land on first. Plus Jakarta Sans stands in for the
        // spec'd Cabinet Grotesk/General Sans, which are Fontshare CDN-only
        // and would break this app's offline-capable native (Capacitor)
        // build; it's the closest self-hostable geometric grotesk with the
        // same confident weight contrast.
        display: ["Plus Jakarta Sans Variable", "system-ui", "sans-serif"],
        sans: ["Public Sans Variable", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono Variable", "ui-monospace", "SFMono-Regular", "monospace"],
      },

      fontSize: {
        // Mobile type scale — size/line-height pairs, fixed by the system.
        // Nothing in the app goes below 11px, legal text included.
        display: ["1.75rem", { lineHeight: "2.125rem", letterSpacing: "-0.02em" }], // 28/34
        h1: ["1.375rem", { lineHeight: "1.75rem", letterSpacing: "-0.015em" }], // 22/28
        h2: ["1.0625rem", { lineHeight: "1.375rem", letterSpacing: "-0.01em" }], // 17/22
        body: ["0.875rem", { lineHeight: "1.25rem" }], // 14/20
        "body-sm": ["0.75rem", { lineHeight: "1rem" }], // 12/16
        caption: ["0.6875rem", { lineHeight: "0.875rem" }], // 11/14
      },

      colors: {
        // Theme-aware surfaces (globals.css :root/.dark)
        bg: "hsl(var(--bg))",
        surface: "hsl(var(--surface))",
        "surface-2": "hsl(var(--surface-2))",
        card: "hsl(var(--card))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        fg: "hsl(var(--fg))",
        muted: "hsl(var(--muted))",
        "muted-fg": "hsl(var(--muted-fg))",

        /* ── The six ─────────────────────────────────────────────────── */
        teal: {
          900: "#04342C", // deepest surfaces — ticket header, promo, splash
          700: "#085041", // primary brand — hero cards, headers, active nav
          100: "#E1F5EE", // tinted surfaces — icon chips, quiet selected states
        },
        amber: {
          500: "#EF9F27", // THE accent. CTA fills, seat glow, price emphasis
          fg: "#1E2723", // ink-on-amber; pure white on amber reads harsh
        },
        ink: "#1E2723", // all body text
        paper: "#FBFAF7", // app background — warm off-white, never cream

        /* ── Semantic status — state only, never decorative ──────────── */
        success: "#1E7A4C",
        warning: "#B8860B",
        error: "#C4432E",
        info: "#2B6CB0",

        // `brand` and `accent` are retained as aliases onto the six so the
        // ~130 existing call sites re-skin to the new system automatically
        // instead of needing a mechanical find/replace that would risk
        // breaking working screens. New code should use teal-*/amber-500.
        brand: {
          DEFAULT: "#085041",
          50: "#E1F5EE",
          100: "#E1F5EE",
          200: "#C3E8DC",
          300: "#8FCDBA",
          400: "#4FA88E",
          500: "#1E7A61",
          600: "#0F6650",
          700: "#085041",
          800: "#064237",
          900: "#04342C",
          950: "#022019",
        },
        accent: {
          DEFAULT: "#EF9F27",
          fg: "#1E2723",
          soft: "#FDF0DC",
          50: "#FEF7ED",
          100: "#FDF0DC",
          200: "#FADCB0",
          300: "#F6C57D",
          400: "#F2B04F",
          500: "#EF9F27",
          600: "#D0831A",
          700: "#A66615",
        },
        danger: "#C4432E", // alias → error, for existing call sites
      },

      borderRadius: {
        none: "0px",
        sm: "0.5rem", // 8px  — chips, tags
        DEFAULT: "0.75rem", // 12px — inputs, small cards, PRIMARY CTA (never pill)
        md: "0.75rem", // 12px
        lg: "0.75rem", // 12px — collapsed onto 12 so stray `rounded-lg` can't
        //         invent a 5th radius step
        xl: "1.25rem", // 20px — large cards, hero widgets
        "2xl": "1.75rem", // 28px — bottom sheets (top corners)
        "3xl": "1.75rem",
        full: "9999px", // avatars and status dots ONLY, never buttons
      },

      boxShadow: {
        none: "none",
        // TWO elevation levels. That is the whole scale.
        // Level 1 = hairline border, no shadow (default card state).
        e1: "0 0 0 1px rgba(4,52,44,0.08)",
        // Level 2 = border + one soft shadow. Floating/sticky elements only:
        // booking bar, FAB, active bottom sheet. Never stacked deeper.
        e2: "0 0 0 1px rgba(4,52,44,0.08), 0 8px 24px rgba(4,52,44,0.08)",
        // Legacy names alias onto the two real levels so un-migrated call
        // sites can't reintroduce a third elevation by accident.
        card: "0 0 0 1px rgba(4,52,44,0.08)",
        lift: "0 0 0 1px rgba(4,52,44,0.08), 0 8px 24px rgba(4,52,44,0.08)",
        e3: "0 0 0 1px rgba(4,52,44,0.08), 0 8px 24px rgba(4,52,44,0.08)",
        glow: "0 0 0 1px rgba(4,52,44,0.08)",
        sm: "0 0 0 1px rgba(4,52,44,0.08)",
        DEFAULT: "0 0 0 1px rgba(4,52,44,0.08)",
        md: "0 0 0 1px rgba(4,52,44,0.08)",
        lg: "0 0 0 1px rgba(4,52,44,0.08), 0 8px 24px rgba(4,52,44,0.08)",
        xl: "0 0 0 1px rgba(4,52,44,0.08), 0 8px 24px rgba(4,52,44,0.08)",
      },

      transitionDuration: {
        fast: "120ms", // state changes — button press, chip select
        base: "220ms", // card expand/collapse
        slow: "320ms", // sheet / page transitions
      },
      transitionTimingFunction: {
        // Structural: decelerated and confident, never bouncy.
        standard: "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        // Micro only: seat select, swap button, toggles, save icons.
        micro: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },

      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // One-shot ring behind a just-selected seat — the single "delight"
        // flourish in the app, spent at the moment closest to purchase.
        "seat-pulse": {
          "0%": { transform: "scale(0.85)", opacity: "0.6" },
          "100%": { transform: "scale(1.9)", opacity: "0" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.8)", opacity: "0.6" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        // Input validation failure — 2px lateral shake, 180ms.
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-2px)" },
          "40%, 80%": { transform: "translateX(2px)" },
        },
        // Terrain line drawing itself in on load.
        "draw-terrain": {
          from: { strokeDashoffset: "1000" },
          to: { strokeDashoffset: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.32s cubic-bezier(0.16,1,0.3,1) both",
        "seat-pulse": "seat-pulse 240ms cubic-bezier(0.16,1,0.3,1) forwards",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.4,0,0.2,1) infinite",
        "sheet-up": "sheet-up 0.32s cubic-bezier(0.16,1,0.3,1) both",
        "slide-in-right": "slide-in-right 0.32s cubic-bezier(0.16,1,0.3,1) both",
        shake: "shake 180ms cubic-bezier(0.16,1,0.3,1)",
        "draw-terrain": "draw-terrain 1.1s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
