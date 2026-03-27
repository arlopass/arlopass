import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://arlopass.com',
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      cssMinify: 'lightningcss',
    },
  },
});
