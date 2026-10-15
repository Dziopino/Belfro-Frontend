import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { formatTitle, resolvePageMeta } from '../utils/pageMeta';

function setMetaContent(selector: string, attrs: Record<string, string>, content: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);

  if (!tag) {
    tag = document.createElement('meta');
    Object.assign(tag, attrs);
    document.head.appendChild(tag);
  }

  tag.setAttribute('content', content);
}

/**
 * Tytuł, opis i `robots` zależą od adresu, więc SPA nie może zostawić metanych z `index.html`
 * na wszystkich podstronach. Nadpisujemy istniejące znaczniki zamiast dokładać nowe: dwa
 * `<meta name="description">` w głowie dokumentu to dla crawlera los, która wygra.
 *
 * Kanoniczny adres bierze samą ścieżkę, bez zapytania — linki jednorazowe (`/verify-email?token=…`)
 * i identyfikatory uczniów nie mają prawa trafić do wyników wyszukiwania.
 */
export default function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = resolvePageMeta(pathname);

    document.title = formatTitle(meta.title);
    setMetaContent(
      'meta[name="description"]',
      { name: 'description' },
      meta.description
    );
    setMetaContent(
      'meta[name="robots"]',
      { name: 'robots' },
      meta.indexable ? 'index, follow' : 'noindex, nofollow'
    );

    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

    if (canonical) {
      canonical.setAttribute('href', `${window.location.origin}${pathname}`);
    }
  }, [pathname]);

  return null;
}
