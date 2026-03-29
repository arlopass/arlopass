import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://arlopass.com',
  compressHTML: true,

  integrations: [
    react(),
    mdx(),
    sitemap({
      serialize(item) {
        if (item.url.includes('/docs/getting-started/')) item.priority = 0.9;
        else if (item.url.includes('/docs/tutorials/')) item.priority = 0.8;
        else if (item.url.includes('/docs/interactive/')) item.priority = 0.5;
        else if (item.url.includes('/docs/')) item.priority = 0.7;
        return item;
      },
    }),
  ],

  build: {
    inlineStylesheets: 'auto',
  },

  vite: {
    plugins: [tailwindcss()],
  },
});