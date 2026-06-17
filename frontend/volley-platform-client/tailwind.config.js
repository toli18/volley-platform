/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0b5cff",
          strong: "#0a4bcf",
        },
      },
      boxShadow: {
        soft: "0 8px 24px rgba(14, 34, 61, 0.12)",
      },
    },
  },
  plugins: [],
};
