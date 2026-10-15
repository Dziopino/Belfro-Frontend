import { defineConfig } from 'vite';

// Konfiguracja TYLKO do smoke testu generatorów PDF w Node. Nic nie zmienia w aplikacji.
// SMOKE_DEV=1 uruchamia asercje geometryczne (DEV_ASSERTIONS=true), bez niego kod produkcyjny.
export default defineConfig({
  publicDir: false,
  define: {
    'import.meta.env.DEV': process.env.SMOKE_DEV === '1' ? 'true' : 'false',
  },
  build: {
    ssr: '.pdf-smoke/smokeEntry.ts',
    outDir: process.env.SMOKE_DEV === '1' ? '.pdf-smoke/dist-dev' : '.pdf-smoke/dist',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      // Node sam wczyta jspdf (warunek "node"), więc łata na prototypie trafia w tę samą instancję modułu
      external: ['jspdf', 'jspdf-autotable'],
    },
  },
});
