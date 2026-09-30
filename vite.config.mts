import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// The dashboard is a static bundle served by the Express middleware from dist/public.
export default defineConfig({
  root: 'ui',
  // Relative asset URLs, so the bundle works under any mount path of the host app
  base: './',
  plugins: [vue()],
  build: {
    outDir: '../dist/public',
    emptyOutDir: true,
  },
  server: {
    // `npm run dev` serves the API on port 3000
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
