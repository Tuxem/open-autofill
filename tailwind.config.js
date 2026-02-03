/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    // Scan all HTML and JS files in src directory recursively
    "./src/**/*.{html,js}",
    // Specifically include the new component directories
    "./src/app/**/*.{html,js}",
    "./src/ui/**/*.{html,js}",
    "./src/core/**/*.js",
    "./src/shared/**/*.js",
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4a90d9',
          hover: '#3a7bc8',
        },
        success: {
          DEFAULT: '#5cb85c',
          hover: '#4cae4c',
        },
        danger: {
          DEFAULT: '#d9534f',
          hover: '#c9302c',
        },
      },
      animation: {
        'slide-in': 'slideIn 0.2s ease-out',
        'modal-in': 'modalSlideIn 0.2s ease-out',
      },
      keyframes: {
        slideIn: {
          from: { opacity: '0', transform: 'translateX(20px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        modalSlideIn: {
          from: { opacity: '0', transform: 'translateY(-20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
