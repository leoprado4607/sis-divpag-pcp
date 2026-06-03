/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
  ],
  // Classes construídas dinamicamente (template strings) não são detectadas pelo
  // scanner estático do Tailwind. O ComparisonApp monta classes a partir de
  // `item.color` e o ResultCard deriva variações de cor em runtime, então essas
  // precisam ser preservadas explicitamente para não sumirem no build de produção.
  safelist: [
    {
      pattern: /(bg|text|border)-(army-green|army-blue|yellow-600)/,
      variants: ['hover', 'group-hover'],
    },
    {
      pattern: /(bg|text)-(red|orange|purple|blue|rose|slate)-(50|500|600|700)/,
    },
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        montserrat: ['Montserrat', 'sans-serif'],
        'roboto-slab': ['"Roboto Slab"', 'serif'],
        oswald: ['Oswald', 'sans-serif'],
        titillium: ['"Titillium Web"', 'sans-serif'],
        merriweather: ['Merriweather', 'serif'],
      },
      colors: {
        army: {
          green: '#1a3c1a',
          light: '#4b6f44',
          gold: '#BD9C4D',
          blue: '#002776',
        },
        divpag: {
          50: '#f4f7f4',
          100: '#e3ebe3',
          200: '#c5d9c5',
          300: '#9dbf9d',
          400: '#76a076',
          500: '#568356',
          600: '#426842',
          700: '#365336',
          800: '#1a3c1a',
          900: '#132b13',
          950: '#0a180a',
        },
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
        'fade-in': 'fadeIn 0.4s ease-out forwards',
      },
    },
  },
  plugins: [],
};
