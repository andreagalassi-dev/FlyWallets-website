/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)", // White/Gold text
        primary: {
          DEFAULT: "#D4AF37", // Metallic Gold
          hover: "#B5952F",
        },
        secondary: {
          DEFAULT: "#1A1A2E", // Dark Blue/Black
          light: "#16213E",
        },
        accent: {
          DEFAULT: "#0F3460",
          light: "#E94560", // Subtle Red for alerts
        },
        surface: "rgba(255, 255, 255, 0.05)", // Glass effect
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "subtle-glow":
          "radial-gradient(circle at center, rgba(212, 175, 55, 0.15) 0%, transparent 70%)",
      },
    },
  },
  plugins: [],
};
