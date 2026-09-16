/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0F141B',
          800: '#151A22',
          700: '#1C232D',
          600: '#273140',
          500: '#3A4657',
        },
        mist: {
          50: '#FFFFFF',
          100: '#F2F5F8',
          200: '#E3E8EE',
          300: '#CBD3DC',
        },
        tungsten: {
          400: '#F6BC5B',
          500: '#F0A62C',
          600: '#D78D14',
        },
        signal: '#3DBE8B',
        alarm: '#E4573D',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '14px' },
    },
  },
  plugins: [],
};
