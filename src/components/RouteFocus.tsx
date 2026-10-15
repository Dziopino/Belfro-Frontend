import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const WAIT_FOR_MAIN_MS = 5000;

/**
 * SPA wymienia widoki bez przeładowania dokumentu, więc przeglądarka nie rusza ni fokusu, ni
 * przewinięcia. Bez tego komponentu klik w wierszu historii zostawia czytnik ekranu na wierszu,
 * który właśnie zniknął, a użytkownik dalej przewija stronę nowymi treściami od połowy.
 *
 * Pierwsze wejście jest pominięte celowo: fokus startowy i przewinięcie mają należeć do
 * przeglądarki, inaczej wejście na adres z linku pocztowego ukradłby fokus polu logowania.
 *
 * `#main-content` bywa jeszcze nieobecny, bo widoki są ładowane per trasa: w chwili nawigacji
 * w drzewie siedzi `RouteFallback`, a `<main>` pojawia się dopiero z dociągniętym pakietem.
 * Dlatego fokus jest doglądany `MutationObserverem`, a nie jednym `getElementById` w efekcie —
 * bez tego przejście Tab po wejściu na widok doczytywany w tej chwili startowałoby od szczytu
 * dokumentu, czyli od skip-linku.
 */
export default function RouteFocus() {
  const { pathname } = useLocation();
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    window.scrollTo(0, 0);

    // `focus()` sam z siebie przewija element do górnej krawędzi viewportu, a `#main-content`
    // siedzi POD `<header>` (np. WalletPage.tsx:201-204). Bez `preventScroll` cofał więc
    // dopiero co wykonane `scrollTo(0, 0)` i ucinał nagłówek na każdej trasie — najbardziej
    // widoczne na mobilnym, gdzie header zajmuje kilka rzędów.
    const current = document.getElementById('main-content');
    if (current) {
      current.focus({ preventScroll: true });
      return;
    }

    const handOver = () => {
      document.getElementById('main-content')?.focus({ preventScroll: true });
    };

    const observer = new MutationObserver(() => {
      if (!document.getElementById('main-content')) return;
      observer.disconnect();
      handOver();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Pakiet może nie dojść (rozłączona sieć, chunk 404 po redeploymie). Observer bez terminu
    // zostałby w drzewie na całą sesję i doglądałby każdy następny render.
    const timeout = window.setTimeout(() => observer.disconnect(), WAIT_FOR_MAIN_MS);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [pathname]);

  return null;
}
