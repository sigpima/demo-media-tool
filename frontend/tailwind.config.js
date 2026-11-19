/** Tokens ported from stitch_creative_batch_toolkit/code.html — see design-system/creative-batch-toolkit/MASTER.md */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: { sm: '640px', md: '768px', desk: '1200px', xl: '1280px', '2xl': '1536px' },
    extend: {
      colors: {
        'surface-container-lowest': '#0c0e12',
        'surface-container-low': '#14161b',
        'surface-container': '#1a1c22',
        'surface-container-high': '#22252c',
        'surface-container-highest': '#2e313b',
        'surface-bright': '#383c48',
        surface: '#111317',
        'surface-dim': '#0e1014',
        'on-surface': '#e2e2e8',
        'on-surface-variant': '#9ca3af',
        muted: '#8b94a3', // tertiary TEXT (6.1:1 on surface). `outline` is decorative only (3.8:1).
        outline: '#6b7280',
        'outline-variant': '#2b2f3a',
        primary: '#818cf8',
        'primary-container': '#4f46e5',
        'on-primary': '#ffffff',
        secondary: '#4edea3',
        'secondary-container': '#059669',
        'on-secondary-container': '#022c22',
        tertiary: '#ffb95f',
        error: '#f87171',
        'error-container': '#450a0a',
      },
      fontFamily: {
        body: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      spacing: { 13: '3.25rem', 88: '22rem' },
      boxShadow: {
        glow: '0 0 16px -2px rgba(99,102,241,0.35)',
        'glow-sm': '0 0 10px rgba(99,102,241,0.2)',
      },
      keyframes: {
        stripe: { '0%': { backgroundPosition: '0 0' }, '100%': { backgroundPosition: '24px 0' } },
        indeterminate: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(250%)' } },
      },
      animation: { stripe: 'stripe 0.8s linear infinite', indeterminate: 'indeterminate 1.2s ease-in-out infinite' },
    },
  },
  plugins: [],
}
