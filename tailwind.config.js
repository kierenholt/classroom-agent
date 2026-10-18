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
          dark: '#121316',
          sidebar: '#1A1D21',
          border: '#333842',
          surface: '#22262C',
          hover: '#2D323A',
        },
        charcoal: {
          base: '#121316',
          surface: '#1A1D21',
          card: '#22262C',
          hover: '#2D323A',
          border: '#333842',
          subtle: '#262A31',
        },
        gold: {
          primary: '#D4AF37',
          hover: '#E5B869',
          active: '#C5A028',
          muted: '#997D25',
          text: '#F3E5AB',
        },
      },
    },
  },
  plugins: [],
}
