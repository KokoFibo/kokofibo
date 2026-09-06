/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0A0A0C',
          soft: '#131317',
          raised: '#1B1B20',
          line: '#28282F',
        },
        paper: {
          DEFAULT: '#F8F6F2',
          dim: '#E7E4DC',
        },
        signal: {
          DEFAULT: '#FF5A1F',
          light: '#FFA23D',
          dim: '#7A2E10',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backgroundImage: {
        'signal-gradient': 'linear-gradient(135deg, #FF5A1F 0%, #FFA23D 100%)',
        'grid-fade': 'radial-gradient(ellipse at top, rgba(255,90,31,0.14), transparent 60%)',
      },
      boxShadow: {
        glow: '0 0 60px -12px rgba(255, 90, 31, 0.45)',
      },
      letterSpacing: {
        widest2: '0.2em',
      },
    },
  },
  plugins: [],
};
