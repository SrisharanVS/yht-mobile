/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          amber: "#f59e0b",
          orange: "#ea580c",
        },
        bg: {
          base: "#0a0a0a",
          elevated: "#111111",
          card: "#1a1a1a",
          border: "#2a2a2a",
        },
        text: {
          primary: "#f5f5f5",
          secondary: "#a3a3a3",
          muted: "#525252",
        },
      },
    },
  },
  plugins: [],
};
