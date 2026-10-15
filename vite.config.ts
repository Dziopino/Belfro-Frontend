import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  /*
   * Biblioteki są wydzielone od kodu aplikacji z dwóch powodów.
   *
   * Cache: pliki mają hash w nazwie, więc dopóki react siedzi w tym samym chunku co strony,
   * każda zmiana w widoku unieważnia 213 kB bibliotek u każdego nauczyciela. Po podziale
   * `react-vendor`, `router` i `http` zmieniają nazwę tylko gdy zmienią się zależności.
   *
   * Requests: bez groupy „icons” ikony lucide rozpadały się na osiemnaście plików poniżej 1 kB
   * (dolina cena: osiemnaście round-tripów za 16 kB kodu). Teraz jest jeden chunk na wszystkie.
   *
   * `priority` rozstrzyga moduł należący do kilku group; kolejność tablicy nie ma znaczenia.
   */
  build: {
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            {
              name: 'react-vendor',
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 30,
            },
            {
              name: 'router',
              test: /node_modules[\\/]react-router/,
              priority: 20,
            },
            {
              name: 'http',
              test: /node_modules[\\/]axios/,
              priority: 20,
            },
            {
              name: 'icons',
              test: /node_modules[\\/]lucide-react/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
})
