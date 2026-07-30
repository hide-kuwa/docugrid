import type { Config } from "tailwindcss";

const greenScale = {
  50: "var(--taxx-green-50)",
  100: "var(--taxx-green-100)",
  200: "var(--taxx-green-200)",
  300: "var(--taxx-green-300)",
  400: "var(--taxx-green-400)",
  500: "var(--taxx-green-500)",
  600: "var(--taxx-green-600)",
  700: "var(--taxx-green-700)",
  800: "var(--taxx-green-800)",
  900: "var(--taxx-green-900)",
  950: "var(--taxx-green-950)",
  DEFAULT: "var(--taxx-green-500)",
} as const;

const accentScale = {
  50: "var(--taxx-accent-50)",
  100: "var(--taxx-accent-100)",
  200: "var(--taxx-accent-200)",
  300: "var(--taxx-accent-300)",
  400: "var(--taxx-accent-400)",
  500: "var(--taxx-accent-500)",
  600: "var(--taxx-accent-600)",
  700: "var(--taxx-accent-700)",
  800: "var(--taxx-accent-800)",
  900: "var(--taxx-accent-900)",
  950: "var(--taxx-accent-950)",
  DEFAULT: "var(--taxx-accent-500)",
} as const;

const neutralScale = {
  50: "var(--taxx-neutral-50)",
  100: "var(--taxx-neutral-100)",
  200: "var(--taxx-neutral-200)",
  300: "var(--taxx-neutral-300)",
  400: "var(--taxx-neutral-400)",
  500: "var(--taxx-neutral-500)",
  600: "var(--taxx-neutral-600)",
  700: "var(--taxx-neutral-700)",
  800: "var(--taxx-neutral-800)",
  900: "var(--taxx-neutral-900)",
  950: "var(--taxx-neutral-950)",
  DEFAULT: "var(--taxx-neutral-900)",
} as const;

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", '"Noto Sans JP"', "sans-serif"],
        wordmark: ['var(--font-wordmark)', '"Space Grotesk"', "sans-serif"],
        "brand-mono": ['var(--font-brand-mono)', '"Space Mono"', "monospace"],
      },
      colors: {
        /* brand = TAXX corporate green (alias for green scale) */
        brand: greenScale,
        green: greenScale,
        accent: accentScale,
        neutral: neutralScale,
        /**
         * Legacy → brand remap. Existing components still reference these
         * Tailwind palette names; point them at brand tokens so the whole app
         * inherits the brand without per-file rewrites.
         *  - slate → neutral (cool ink)
         *  - blue / indigo / sky → brand green (kill competitor blue)
         *  - emerald / teal → brand green (unify accent greens to hue 172)
         */
        slate: neutralScale,
        gray: neutralScale,
        zinc: neutralScale,
        blue: greenScale,
        indigo: greenScale,
        sky: greenScale,
        cyan: greenScale,
        emerald: greenScale,
        teal: greenScale,
        /* secondary accent (AI / normalization). Muted violet tuned to the
           brand chroma so it harmonizes with the corporate green. */
        violet: accentScale,
        purple: accentScale,
        fuchsia: accentScale,
        white: "var(--taxx-white)",
        background: "var(--taxx-bg)",
        surface: "var(--taxx-surface)",
        foreground: "var(--taxx-text)",
        muted: "var(--taxx-text-muted)",
        border: "var(--taxx-border)",
        primary: {
          DEFAULT: "var(--taxx-primary)",
          hover: "var(--taxx-primary-hover)",
          foreground: "var(--taxx-primary-fg)",
        },
        link: {
          DEFAULT: "var(--taxx-link)",
          hover: "var(--taxx-link-hover)",
        },
        success: "var(--taxx-success)",
        info: "var(--taxx-info)",
        warning: "var(--taxx-warning)",
        error: "var(--taxx-error)",
        focus: "var(--taxx-focus-ring)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
export default config;
