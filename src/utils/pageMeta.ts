export interface PageMeta {
  /** Tytuł strony bez marki — `formatTitle` dokleja „Belfero". */
  title: string;
  description: string;
  /**
   * `false` oznacza `noindex, nofollow`. Ustawiamy tak każdy adres wymagający sesji oraz każdy,
   * w którego ścieżce jest identyfikator ucznia, sesji lub jednorazowy token: indeksowanie takich
   * URL-i wycieka do wyników wyszukiwania niezależnie od tego, czy treść jest chroniona loginem.
   */
  indexable: boolean;
}

const BRAND = 'Belfero';

interface PublicRouteMeta extends PageMeta {
  path: string;
}

/** Adresy, pod którymi aplikacja działa bez zalogowania. */
const PUBLIC_ROUTES: PublicRouteMeta[] = [
  {
    path: '/login',
    title: 'Logowanie',
    description: 'Zaloguj się do Belfero, żeby oceniać prace pisemne swojej klasy.',
    indexable: true,
  },
  {
    path: '/register',
    title: 'Załóż konto nauczyciela',
    description:
      'Rejestracja w Belfero: konto nauczyciela, potwierdzane linkiem na adres email i numerem telefonu.',
    indexable: true,
  },
  {
    path: '/forgot-password',
    title: 'Odzyskiwanie hasła',
    description: 'Poproś o jednorazowy link, który pozwoli ustawić nowe hasło do konta Belfero.',
    indexable: true,
  },
  {
    path: '/reset-password',
    title: 'Ustaw nowe hasło',
    description: 'Ustaw nowe hasło do konta Belfero z linku wysłanego na adres email.',
    indexable: false,
  },
  {
    path: '/verify-email',
    title: 'Potwierdź adres email',
    description: 'Potwierdzenie adresu email konta nauczyciela w Belfero.',
    indexable: false,
  },
  {
    path: '/verify-phone',
    title: 'Potwierdź numer telefonu',
    description: 'Wpisz kod SMS, żeby potwierdzić numer telefonu konta w Belfero.',
    indexable: false,
  },
];

/** Klucz to prefiks ścieżki; dłuższe dopasowanie wygrywa, więc `/history/:id` nie weźmie wiersza `/history`. */
const PROTECTED_ROUTES: Record<string, PageMeta> = {
  '/dashboard': {
    title: 'Pulpit',
    description: 'Podsumowanie pracy Belfero: klasy, oczekujące sesje i saldo stron.',
    indexable: false,
  },
  '/classes': {
    title: 'Moje klasy',
    description: 'Lista klas nauczyciela w Belfero.',
    indexable: false,
  },
  '/grading': {
    title: 'Kolejka oceniania',
    description: 'Prace czekające na ocenę w Belfero.',
    indexable: false,
  },
  '/grade-thresholds': {
    title: 'Progi ocen',
    description: 'Skale i progi przeliczania punktów na oceny.',
    indexable: false,
  },
  '/answer-keys': {
    title: 'Klucze odpowiedzi',
    description: 'Klucze odpowiedzi z wariantami prac i podpunktami.',
    indexable: false,
  },
  '/history': {
    title: 'Historia oceniania',
    description: 'Archiwum sesji oceniania w Belfero.',
    indexable: false,
  },
  '/wallet': {
    title: 'Saldo stron',
    description: 'Stan salda za strony i katalog doładowań Belfero.',
    indexable: false,
  },
  '/settings': {
    title: 'Ustawienia konta',
    description: 'Dane konta nauczyciela, domyślna skala i próg alertu.',
    indexable: false,
  },
  '/subscription': {
    title: 'Saldo stron',
    description: 'Adres przeniesiony na saldo stron.',
    indexable: false,
  },
};

const FALLBACK: PageMeta = {
  title: 'Strona nieznaleziona',
  description: 'Ten adres nie istnieje w Belfero.',
  indexable: false,
};

const PUBLIC_BY_PATH: Record<string, PageMeta> = Object.fromEntries(
  PUBLIC_ROUTES.map(({ path, ...meta }) => [path, meta])
);

export function publicRoutes(): Array<{ path: string; meta: PageMeta }> {
  return Object.entries(PUBLIC_BY_PATH).map(([path, meta]) => ({ path, meta }));
}

export function protectedRoutePaths(): string[] {
  return Object.keys(PROTECTED_ROUTES);
}

/**
 * Dobór metanych po ścieżce bez zapytania. `pathname` z `react-router` bywa zakotwiczony na
 * `/classes/123`, a w tabeli stoi prefiks `/classes` — wygrywa najdłuższy pasujący prefiks.
 */
export function resolvePageMeta(pathname: string): PageMeta {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  if (PUBLIC_BY_PATH[clean]) return PUBLIC_BY_PATH[clean];

  let best: { path: string; meta: PageMeta } | null = null;

  for (const [path, meta] of Object.entries(PROTECTED_ROUTES)) {
    if (clean !== path && !clean.startsWith(`${path}/`)) continue;
    if (!best || path.length > best.path.length) best = { path, meta };
  }

  return best ? best.meta : FALLBACK;
}

export function formatTitle(pageTitle: string): string {
  return `${pageTitle} — ${BRAND}`;
}
