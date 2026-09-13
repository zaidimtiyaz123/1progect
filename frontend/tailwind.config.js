/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#fff7ed',100:'#ffedd5',500:'#f97316',600:'#ea580c',700:'#c2410c',900:'#7c2d12' },
        ink: { 50:'#f8fafc', 900:'#0f172a' }
      },
      fontFamily: { sans: ['Inter','system-ui','sans-serif'] }
    }
  },
  plugins: []
}
