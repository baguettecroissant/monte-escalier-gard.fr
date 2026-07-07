import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://monte-escalier-gard.fr',
  output: 'static',
  adapter: cloudflare({
    imageService: 'passthrough'
  }),
  vite: {
    define: {
      'process.stderr': '({ write: (msg) => console.error(msg) })',
      'process.stdout': '({ write: (msg) => console.log(msg) })',
      'process': '({ stderr: { write: (msg) => console.error(msg) }, stdout: { write: (msg) => console.log(msg) } })'
    }
  },
  integrations: [
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        return !['/mentions-legales', '/politique-confidentialite', '/confirmation'].some(
          (excluded) => path.startsWith(excluded) || path.startsWith(excluded + '/')
        );
      }
    })
  ]
});
