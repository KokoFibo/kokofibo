import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  build: { inlineStylesheets: 'always' },
  site: 'https://kokofibo.com',
  vite: {
    build: {
      // The three.js engine chunk (~530 kB, ~133 kB gzip) is lazy-loaded after
      // page load by src/components/SceneCanvas.astro, so it never blocks first paint.
      chunkSizeWarningLimit: 600,
    },
  },
  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
    sitemap(),
  ],
});
