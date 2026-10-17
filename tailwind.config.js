/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        cormorant: ['"Cormorant Garamond"', 'serif'],
        playfair: ['"Playfair Display"', 'serif'],
      },
      colors: {
        army: {
          green:    '#2E3D1A',
          mid:      '#445526',
          light:    '#6B7A42',
          gold:     '#A8832A',
          'gold-light': '#C9A84C',
          // dourado para texto pequeno sobre fundo claro (5,7:1 no branco; o gold dá 3,3:1)
          'gold-deep': '#7F6220',
          blue:     '#002776',
          cream:    '#F5F2EA',
          'cream-dark': '#EAE5D5',
          charcoal: '#1A1D12',
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
        growBar: {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'grow-bar': 'growBar 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards',
      },
      spacing: {
        '74': '298px',
      },
      height: {
        '16': '64px',
        '9/10': '90%',
        '1/10': '10%',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
