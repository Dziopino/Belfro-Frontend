import { useCallback, useSyncExternalStore } from 'react';

/**
 * Bieżący wynik zapytania medialnego CSS. Potrzebny tam, gdzie układ decyduje o widoczności
 * elementu (`lg:` w arkuszu), a stan JSX musi znać tę samą granicę: bez tego zamknięty panel
 * nawigacji na telefonie pozostaje w kolejce fokusu, choć go nie widać.
 *
 * `useSyncExternalStore` zamiast `useState` w efekcie, bo `matchMedia` jest exactly takim
 * zewnętrznym systemem, do którego ten hook istnieje: wartość jest czytana w momencie renderu,
 * więc nie ma pierwszego klatki z nieaktualnym stanem ani ostrzeżenia `set-state-in-effect`.
 * Nasłuch idzie na `MediaQueryList`, bo `matchMedia`-owe `addListener` jest porzucone.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
