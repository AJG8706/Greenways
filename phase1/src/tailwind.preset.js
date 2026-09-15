/**
 * Greenways Tailwind preset — v0.1 (Phase 1)
 * Source of truth: Branding/greenways-brand-kit/tokens/greenways-tokens.json
 * Usage (tailwind.config.js):  module.exports = { presets: [require('./tailwind.preset')], content: [...] }
 * Semantic surface tokens (bg, text, line…) come from greenways.css variables so components
 * can be themed by wrapping them in [data-surface="light"] or [data-surface="walk"].
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        gw: {
          'pasture-green': '#34452D',
          'pine-shadow': '#24301F',
          'prairie-cream': '#F5F3E9',
          'sage-mist': '#CBD2B8',
          'harvest-gold': '#BCAA6E',
          'hill-green': '#4A5E3E',
          'trailhead-green': '#8DBA5E',
          'trailhead-deep': '#48712F',
          'gold-ink': '#76672F',
          'fence-post-red': '#A23B2A',
          'cream-2': '#ECE9DC',
          'cream-3': '#E2DECD',
          'pine-2': '#2E3C28',
          'pine-3': '#1B241A',
          'sage-ink': '#5B6650',
        },
        // semantic, surface-aware (resolved by greenways.css)
        surface: 'var(--bg)',
        'surface-2': 'var(--bg-2)',
        'surface-3': 'var(--bg-3)',
        line: 'var(--line)',
        ink: 'var(--text)',
        'ink-2': 'var(--text-2)',
        heading: 'var(--heading)',
        link: 'var(--link)',
        accent: 'var(--accent-text)',
        focus: 'var(--focus)',
        error: 'var(--error)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        path: 'var(--path)',
        marker: 'var(--marker)',
      },
      fontFamily: {
        display: ['"Zilla Slab"', 'Rockwell', '"Roboto Slab"', 'Georgia', 'serif'],
        ui: ['"Atkinson Hyperlegible Next"', '"Atkinson Hyperlegible"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      fontSize: {
        display: ['2.5rem', { lineHeight: '1.1', fontWeight: '700' }],
        h1: ['2rem', { lineHeight: '1.19', fontWeight: '700' }],
        h2: ['1.5625rem', { lineHeight: '1.28', fontWeight: '600' }],
        h3: ['1.25rem', { lineHeight: '1.3', fontWeight: '600' }],
        body: ['1.0625rem', { lineHeight: '1.59' }],
        small: ['0.875rem', { lineHeight: '1.5', fontWeight: '500' }],
        label: ['0.75rem', { lineHeight: '1.33', fontWeight: '700', letterSpacing: '0.08em' }],
        'hud-distance': ['clamp(4rem, 22vw, 6.5rem)', { lineHeight: '1', fontWeight: '700', letterSpacing: '-0.02em' }],
        'hud-corner': ['clamp(1.75rem, 8vw, 2.25rem)', { lineHeight: '1.1', fontWeight: '700' }],
      },
      spacing: { 'tap': '56px', 'tap-admin': '40px' },
      borderRadius: { '1': '6px', '2': '10px', '3': '16px' },
      boxShadow: {
        1: '0 1px 2px rgba(36,48,31,.08), 0 1px 1px rgba(36,48,31,.04)',
        2: '0 6px 20px rgba(36,48,31,.12), 0 2px 6px rgba(36,48,31,.06)',
        'walk-2': '0 10px 30px rgba(0,0,0,.45)',
      },
      transitionTimingFunction: { gw: 'cubic-bezier(.2,.7,.2,1)' },
      transitionDuration: { 1: '120ms', 2: '200ms', 3: '360ms' },
    },
  },
  plugins: [],
};
