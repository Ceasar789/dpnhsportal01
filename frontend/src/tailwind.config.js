// ============================================
// FILE: tailwind.config.js
// PURPOSE: Tailwind CSS configuration
// ============================================

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Your exact Flutter colors
        'dpnhs-navy': '#0d2b5c',
        'dpnhs-navy-light': '#1a5276',
        'dpnhs-gold': '#FEB300',
        'dpnhs-gold-dark': '#d4a843',
        'dpnhs-blue': '#1E3A8A',
        'dpnhs-blue-dark': '#001D4E',
        'dpnhs-gray': '#64748B',
        'dpnhs-gray-light': '#94A3B8',
        'dpnhs-bg': '#F8F9FA',
        'dpnhs-border': '#E2E8F0',
      },
      fontFamily: {
        'work': ['"Work Sans"', 'sans-serif'],
        'public': ['"Public Sans"', 'sans-serif'],
        'lato': ['Lato', 'sans-serif'],
      },
    },
  },
  plugins: [],
}