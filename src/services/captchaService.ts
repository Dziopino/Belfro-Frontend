import { authAPI } from './apiService';
import type { CaptchaConfig } from '../types';

/**
 * Konfiguracja bramki antybotowej jest jedna dla całej aplikacji i nie zmienia się w życiu
 * formularza, więc pytamy o nią raz. Trzy strony (logowanie, rejestracja, prośba o link do
 * resetu hasła) montują się w StrictMode podwójnie (`main.tsx:7-8`) i bez tego wspólnego wpisu
 * każda wysyłała `GET /auth/captcha-config` dwa razy przy jednym wejściu na stronę.
 *
 * Cache trzyma żądanie w drodze, a nie jego wartość: udany odczyt zapamiętujemy do czasu
 * przeładowania dokumentu, a błąd (backend offline, 500) zostawiamy pusty, żeby „Spróbuj
 * ponownie" realnie ponowiło żądanie zamiast oddawać ten sam odrzucony promise.
 */
let request: Promise<CaptchaConfig> | null = null;

export function loadCaptchaConfig(): Promise<CaptchaConfig> {
  if (!request) {
    request = authAPI.getCaptchaConfig().catch((error) => {
      request = null;
      throw error;
    });
  }

  return request;
}
