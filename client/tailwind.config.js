/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        aviation: {
          darkest: '#0a0f1e',
          dark: '#0d1526',
          base: '#111827',
          blue: '#3b82f6',
          cyan: '#06b6d4',
        }
      }
    },
  },
  plugins: [],
}
