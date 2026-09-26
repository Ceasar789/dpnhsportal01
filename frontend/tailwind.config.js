/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'dpnhs-navy': '#0d2b5c',
        'dpnhs-gold': '#d4a843',
        'dpnhs-bg': '#f5f5f5',
        'dpnhs-gray': '#6B7280',
      },
      fontFamily: {
        'work': ['Work Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
}