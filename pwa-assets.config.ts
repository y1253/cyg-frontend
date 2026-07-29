import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Derives the PWA icon set from the brand favicon. The source is 503x503, so the
// manifest can't honestly claim 192/512 without this step — and Android crops icons
// into a platform mask, which needs the separate `maskable` variant.
//
// Assets are written next to the source image (i.e. into `public/`) and ARE committed.
// Re-run `npm run generate-pwa-assets` whenever cyg-favicon.png changes.
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/cyg-favicon.png'],
});
