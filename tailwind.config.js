/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-base': '#020617',
        'bg-card': '#0f172a',
        'primary': '#3b82f6',
        'accent-green': '#10b981',
      },
      fontFamily: {
        'syne': ['Syne', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
