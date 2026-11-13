import type { Config } from 'tailwindcss';

/**
 * Industrial dark theme: gunmetal (neutral steel greys) + olive (military green)
 * with a brass accent for highlights/warnings.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gunmetal: {
          50: '#f3f5f6',
          100: '#e2e6e9',
          200: '#c5ccd2',
          300: '#9aa5ae',
          400: '#6f7c87',
          500: '#55616b',
          600: '#434d55',
          700: '#363e45',
          800: '#2a3036',
          900: '#1e2328',
          950: '#13171a',
        },
        olive: {
          50: '#f6f7ee',
          100: '#e9edd5',
          200: '#d4dbac',
          300: '#b6c27a',
          400: '#99a852',
          500: '#7c8b3a',
          600: '#606d2c',
          700: '#4a5425',
          800: '#3c4421',
          900: '#343b1f',
          950: '#1a1f0d',
        },
        brass: {
          300: '#e8c27a',
          400: '#d9a441',
          500: '#c08a2b',
          600: '#9a6c1f',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 4px 12px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
} satisfies Config;
