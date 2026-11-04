/**
 * CEMS design tokens: DARK BLUE theme.
 * jacaranda = brand (electric blue), bloom = second accent (aqua),
 * acacia = success, sunbird = warning, rose = error,
 * ink = text and surfaces (scale is inverted: 50 = page black, 900 = near-white text),
 * surface = card / panel background.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: '#0A1224',
        ink: {
          50: '#050914', 100: '#0F1930', 200: '#1F2D4D', 300: '#5A6B94',
          500: '#9AA8C9', 700: '#CBD5EE', 800: '#E6ECFA', 900: '#F5F8FF',
        },
        jacaranda: {
          50: '#071738', 100: '#0E2A66', 200: '#1F4DB8', 500: '#3B82F6',
          600: '#4D8DFF', 700: '#A5C8FF',
        },
        bloom: { 50: '#052A2C', 100: '#0A4A4D', 200: '#12808A', 500: '#22D3EE', 600: '#2DE2E6', 700: '#9AF3F5' },
        acacia: { 50: '#05231A', 100: '#0A3A2B', 600: '#34D399', 700: '#86EFC5' },
        sunbird: { 50: '#2A1D04', 100: '#42300A', 600: '#FBBF24', 700: '#FCD677' },
        rose: { 50: '#2D0F0C', 100: '#4A1914', 600: '#FF6B5E', 700: '#FFA59C' },
      },
      boxShadow: {
        glow: '0 0 24px -4px rgba(77,141,255,.65), 0 0 36px -10px rgba(45,226,230,.4)',
        'glow-sm': '0 0 14px -4px rgba(77,141,255,.6)',
      },
      borderRadius: { stub: '1.25rem' },
    },
  },
  plugins: [],
};