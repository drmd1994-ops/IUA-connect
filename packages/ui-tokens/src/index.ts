/**
 * Design tokens (spec §42: professional, modern, medical, minimal, trustworthy; not a
 * clinical-hospital look). Text/background pairs are checked against WCAG 2.2 AA in tests.
 * `scripts/build-css.mjs` turns these into a Tailwind v4 `@theme` block (dist/tokens.css).
 */
export const colors = {
  brand: {
    50: '#f1f7fa',
    100: '#dcecf3',
    200: '#b6d7e6',
    300: '#7fb7d0',
    400: '#4592b3',
    500: '#23779a',
    600: '#18607f',
    700: '#134d67',
    800: '#103e53',
    900: '#0c2d3d',
  },
  accent: {
    100: '#f8ecdc',
    500: '#b86e1d',
    700: '#8a5114',
  },
  neutral: {
    0: '#ffffff',
    50: '#f7f9fa',
    100: '#eef1f3',
    200: '#dde3e7',
    300: '#c3ccd2',
    400: '#8e9ba4',
    500: '#66757f',
    600: '#4c5a63',
    700: '#37434b',
    800: '#232d33',
    900: '#131a1e',
  },
  success: { 100: '#e2f4ea', 700: '#1d6b40' },
  warning: { 100: '#fdf1d8', 700: '#7a5405' },
  danger: { 100: '#fbe4e4', 700: '#a12a2a' },
} as const;

/** Semantic roles used by components. Values reference the palette above. */
export const semantic = {
  background: colors.neutral[50],
  surface: colors.neutral[0],
  surfaceMuted: colors.neutral[100],
  border: colors.neutral[200],
  text: colors.neutral[900],
  textMuted: colors.neutral[600],
  primary: colors.brand[700],
  primaryHover: colors.brand[800],
  onPrimary: colors.neutral[0],
  focusRing: colors.brand[500],
  accent: colors.accent[700],
} as const;

export const radii = {
  sm: '0.375rem',
  md: '0.625rem',
  lg: '1rem',
  full: '9999px',
} as const;

/** Type scale (rem). Body text is 1rem minimum for readability; scales with user font size. */
export const fontSizes = {
  xs: '0.8125rem',
  sm: '0.9375rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.375rem',
  '2xl': '1.75rem',
  '3xl': '2.25rem',
  '4xl': '2.875rem',
} as const;

export const fonts = {
  sans: '"IBM Plex Sans", "IBM Plex Sans Hebrew", system-ui, "Segoe UI", Arial, sans-serif',
} as const;

export const shadows = {
  card: '0 1px 2px rgb(19 26 30 / 0.06), 0 2px 8px rgb(19 26 30 / 0.05)',
  raised: '0 4px 16px rgb(19 26 30 / 0.10)',
} as const;
