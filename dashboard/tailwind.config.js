/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        deep:    '#02040f',
        panel:   'rgba(4,8,28,0.92)',
        cyan:    '#22d3ee',
        indigo:  '#818cf8',
        amber:   '#f59e0b',
        critical:'#ef4444',
        high:    '#f97316',
        medium:  '#eab308',
        low:     '#22c55e',
      },
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'scan': 'scan 4s linear infinite',
      },
    },
  },
  plugins: [],
}
