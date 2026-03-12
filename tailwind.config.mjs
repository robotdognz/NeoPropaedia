/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      colors: {
        // Each Part gets a distinct accent color
        'part-1':  { DEFAULT: '#1e40af', light: '#dbeafe' }, // Matter & Energy — deep blue
        'part-2':  { DEFAULT: '#065f46', light: '#d1fae5' }, // Earth — emerald
        'part-3':  { DEFAULT: '#059669', light: '#d1fae5' }, // Life on Earth — green
        'part-4':  { DEFAULT: '#dc2626', light: '#fee2e2' }, // Human Life — red
        'part-5':  { DEFAULT: '#7c3aed', light: '#ede9fe' }, // Human Society — violet
        'part-6':  { DEFAULT: '#ea580c', light: '#ffedd5' }, // Art — orange
        'part-7':  { DEFAULT: '#0891b2', light: '#cffafe' }, // Technology — cyan
        'part-8':  { DEFAULT: '#4338ca', light: '#e0e7ff' }, // Religion — indigo
        'part-9':  { DEFAULT: '#be185d', light: '#fce7f3' }, // History — pink
        'part-10': { DEFAULT: '#854d0e', light: '#fef9c3' }, // Knowledge — amber
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
