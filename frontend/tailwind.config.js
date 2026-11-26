// === filename: frontend/tailwind.config.js ===
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d1117', surface: '#161b22', surface2: '#1c2333', border: '#30363d',
        muted: '#8b949e', text: '#e6edf3', blue: '#2f81f7', green: '#3fb950',
        red: '#f85149', yellow: '#d29922', orange: '#f0883e', purple: '#bc8cff', cyan: '#39d5ff',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
