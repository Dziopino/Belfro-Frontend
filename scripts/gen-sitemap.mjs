/*
 * Generator `dist/sitemap.xml` i domykania `dist/robots.txt` po `vite build`.
 *
 * Jednym źródłem prawdy jest tabela `src/utils/pageMeta.ts` — skrypt wyciąga z niej adresy
 * publiczne i indeksowalne, więc nie da się wypuścić sitemap-y z trasą, której aplikacja nie ma,
 * ani odwrotnie. Nie znajdzie wpisu — budowanie padnie z komunikatem, a nie cichą pustą listą.
 *
 * Bez `VITE_SITE_URL` skrypt nic nie pisze i wychodzi zero: domena produkcyjna należy do
 * konfiguracji wdrożenia, a zmyślony adres w sitemapie jest gorszy niż jej brak.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TABLE = path.join(ROOT, 'src', 'utils', 'pageMeta.ts');
const DIST = path.join(ROOT, 'dist');

function publicIndexableRoutes() {
  const source = fs.readFileSync(TABLE, 'utf8');
  const block = /const PUBLIC_ROUTES[^=]*= \[([\s\S]*?)\n\];/.exec(source);

  if (!block) {
    throw new Error(
      'Nie znalazłem bloku `const PUBLIC_ROUTES = [...]` w src/utils/pageMeta.ts — ' +
        'zmienił się kształt tabeli i generator sitemap nie ma z czego czytać tras.'
    );
  }

  const entries = [...block[1].matchAll(/\{\s*path: '([^']+)',[\s\S]*?indexable: (true|false),/g)];

  if (entries.length === 0) {
    throw new Error('Blok PUBLIC_ROUTES nie zawiera ani jednego wpisu z `path` i `indexable`.');
  }

  return entries
    .filter(([, , indexable]) => indexable === 'true')
    .map(([, routePath]) => routePath);
}

function main() {
  const siteUrl = (process.env.VITE_SITE_URL ?? '').trim();

  if (!/^https?:\/\//.test(siteUrl)) {
    console.log(
      'VITE_SITE_URL nie ustawiony (albo nie jest pełnym adresem http/https) — pomijam sitemap.xml. ' +
        'Ustaw go w konfiguracji wdrożenia, żeby dist/sitemap.xml powstał.'
    );
    return;
  }

  if (!fs.existsSync(DIST)) {
    throw new Error(`Brak katalogu ${DIST} — generator musi biec po vite build.`);
  }

  const origin = siteUrl.replace(/\/+$/, '');
  const routes = publicIndexableRoutes();
  const today = new Date().toISOString().slice(0, 10);

  const urls = routes
    .map((routePath) => `  <url>\n    <loc>${origin}${routePath}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`)
    .join('\n');

  fs.writeFileSync(
    path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );

  const robotsFile = path.join(DIST, 'robots.txt');

  if (fs.existsSync(robotsFile) && !/^[ \t]*Sitemap:/im.test(fs.readFileSync(robotsFile, 'utf8'))) {
    fs.appendFileSync(robotsFile, `\nSitemap: ${origin}/sitemap.xml\n`);
  }

  console.log(`dist/sitemap.xml: ${routes.length} adresów pod ${origin}`);
}

try {
  main();
} catch (error) {
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
}
