/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        navy: { 950: '#101c3a', 900: '#15244a', 800: '#1c3262' },
        mint: { 50: '#eefcf6', 100: '#d3f8e7', 500: '#24b47e', 600: '#16996a' }
      },
      boxShadow: {
        card: '0 10px 30px rgba(21, 36, 74, 0.055)',
        pop: '0 22px 70px rgba(14, 26, 54, 0.18)'
      }
    }
  },
  plugins: []
};
