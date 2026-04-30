export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Core Palette (UI/UX Design Pro)
        'hicado-navy': '#1A2332',
        'hicado-emerald': '#10B981',
        'hicado-obsidian': '#0A0A0B',
        'hicado-slate': '#F1F5F9',
        'hicado-parchment': '#FBFBF9',
        'hicado-amber': '#F59E0B',
        
        // Semantic Layer
        bg100: '#FBFBF9', // Parchment light
        bg200: '#F1F5F9', // Slate subtle
        bg000: '#FFFFFF',
        text100: '#1A2332', // Navy dark
        text300: '#475569', // Slate muted
        text400: '#64748B', // Slate very muted
        accent: '#10B981', // Emerald growth
        'accent-dark': '#059669',
        borderline: '#E2E8F0',
        heading: '#1A2332',
        'body-text': '#475569',
        'app-bg': '#FBFBF9',
        'management-dark': '#1A2332',
        'management-blue': '#10B981',
        'management-bg': '#F1F5F9',
        'management-border': '#E2E8F0',
        primary: '#1A2332',
        success: '#10B981',
        error: '#EF4444',
        'ant-border': '#E2E8F0',
      },

      boxShadow: {
        soft: '0 2px 6px rgba(45, 45, 42, 0.04)',
        premium: '0 4px 12px rgba(45, 45, 42, 0.06)',
      },
      borderRadius: {
        button: '10px',
        card: '12px',
        container: '14px',
        xl: '0.75rem',
        '2xl': '0.85rem',
        '3xl': '1rem',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Lora', 'serif'],
      },
    },
  },
  plugins: [],
};
