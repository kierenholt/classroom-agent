/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          dark: '#0d1117',
          sidebar: '#161b22',
          border: '#30363d',
          surface: '#21262d',
        }
      }
    },
  },
  plugins: [],
}
