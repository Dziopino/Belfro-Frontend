/*
 * Asercje SEO, metanych na trasach oraz nagłówków i landmarków widoków. Uruchom:
 *   npm run check:seo        (albo: node scripts/check-seo.mjs)
 *
 * Skrypt czyta `index.html`, pliki z `public/`, `src/App.tsx` i tabelę tras z `src/utils/pageMeta.ts`
 * (import z Node 24, który sam zdejmuje typy — dzięki temu sprawdzamy TEJ samej funkcji, której używa
 * aplikacja, a nie jej kopii). Nic nie buduje i niczego nie zapisuje.
 *
 * Dlaczego to istnieje: metane w powłoce SPA psują się po cichu. Ktoś doda trasę i nikt nie
 * zauważy, że `/history/:id/grade/:id` trafił do wyników wyszukiwania z identyfikatorem ucznia
 * w adresie. Tu taka zmiana wychodzi jako czerwony wynik.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { formatTitle, protectedRoutePaths, publicRoutes, resolvePageMeta } from '../src/utils/pageMeta.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

let failures = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`OK   ${label}`);
    return;
  }

  failures += 1;
  console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Szerokość i wysokość z IHDR — bez zależności, bo nie wolno niczego instalować. */
function pngSize(file) {
  const buf = fs.readFileSync(file);
  const signature = buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(12) === 0x49484452;

  if (!signature) return null;

  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const html = read('index.html');

/*
 * Bez komentarzy HTML — blok JSON-LD wyciągamy z dokumentu, a nie z objaśnień, które ktoś
 * zostawił przy tagach.
 */
const htmlCode = html.replace(/<!--[\s\S]*?-->/g, '');

/*
 * Znaczniki liczymy na samych znacznikach, bez treści skryptów: inline script w powłoce cytuje
 * `<link rel="canonical" href="/">` w swoim komentarzu wyjaśniającym, a test canonical sprawdza
 * obecność elementu w markupie, nie to, co ktoś napisał w JS.
 */
const htmlMarkup = htmlCode.replace(/<script[\s\S]*?<\/script>/g, '');

console.log('== Powłoka index.html');
check('html ma lang="pl"', /<html lang="pl">/.test(htmlMarkup), 'czytnik ekranu inaczej deklaruje polszczyznę');
check(
  'jest realny tytuł z marką',
  /<title>Belfero — .+<\/title>/.test(htmlMarkup),
  /<title>([^<]*)<\/title>/.exec(htmlMarkup)?.[1] ?? 'brak tytułu'
);

const description = /<meta\s+name="description"\s+content="([^"]+)"/.exec(htmlMarkup)?.[1] ?? '';
check('opis mieści się w 50-160 znaków', description.length >= 50 && description.length <= 160, `${description.length} znaków`);
check('są og:type, og:locale i og:site_name', /property="og:type" content="website"/.test(htmlMarkup) && /property="og:locale" content="pl_PL"/.test(htmlMarkup) && /property="og:site_name" content="Belfero"/.test(htmlMarkup));
check('jest theme-color zgodny z tłem aplikacji', /name="theme-color" content="#0B0F19"/.test(htmlMarkup));
check('jest manifest i apple-touch-icon', /rel="manifest" href="\/site\.webmanifest"/.test(htmlMarkup) && /rel="apple-touch-icon" href="\/icons\/icon-192\.png"/.test(htmlMarkup));
check('jest preconnect do Turnstile', /rel="preconnect" href="https:\/\/challenges\.cloudflare\.com"/.test(htmlMarkup));
check(
  'noscript niesie nagłówek i linki do stron publicznych',
  /<noscript>[\s\S]*<h1>[^<]+<\/h1>[\s\S]*href="\/login"[\s\S]*href="\/register"[\s\S]*<\/noscript>/.test(htmlMarkup)
);
check(
  'brak statycznego <link rel="canonical" href="/">',
  !/rel="canonical"[^>]*href="\/"/.test(htmlMarkup),
  'Vite traktuje „/" jako zasób do osadzenia i budowanie pada (EISDIR)'
);
check('#root ma polski fallback przed pierwszym renderem', /<div id="root">\s*<p[^>]*>[\p{L}]{5,}/u.test(htmlMarkup));

const shellThemeColor = /name="theme-color" content="([^"]+)"/.exec(htmlMarkup)?.[1] ?? '';
const sheetCss = read('src', 'index.css');
const bodyBackground = /body\s*\{[^}]*background-color:\s*([^;]+);/.exec(sheetCss)?.[1]?.trim() ?? '';

check('tło body w arkuszu to ten sam hex co theme-color powłoki', Boolean(bodyBackground) && bodyBackground.toLowerCase() === shellThemeColor.toLowerCase(), `arkusz: ${bodyBackground || 'brak reguły'}, meta: ${shellThemeColor}`);
check('arkusz nie deklaruje jasnego wariantu motywu', !/color-scheme:\s*light dark/.test(sheetCss), 'aplikacja jest wyłącznie ciemna');

const ldBlocks = [...htmlCode.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
check('jest dokładnie jeden blok JSON-LD', ldBlocks.length === 1, `znaleziono ${ldBlocks.length}`);

let ld = null;

if (ldBlocks.length === 1) {
  try {
    ld = JSON.parse(ldBlocks[0][1]);
    check('JSON-LD jest parsowalny i opisuje aplikację webową', ld?.['@type'] === 'WebApplication' && ld?.name === 'Belfero');
    check('JSON-LD deklaruje polszczyznę', ld?.inLanguage === 'pl', String(ld?.inLanguage));
    check(
      'JSON-LD nie zawiera bezwzględnego adresu z domyślnej domeny',
      !/https?:\/\/(belfero\.(pl|com|app|dev)|example)/.test(JSON.stringify(ld)),
      'domena produkcyjna jest tylko w konfiguracji wdrożenia'
    );
  } catch (error) {
    check('JSON-LD jest parsowalny', false, String(error.message));
  }
}

console.log('\n== Pliki w public/');

const manifestRaw = read('public', 'site.webmanifest');
let manifest = null;

try {
  manifest = JSON.parse(manifestRaw);
  check('site.webmanifest parsuje się', true);
} catch (error) {
  check('site.webmanifest parsuje się', false, String(error.message));
}

if (manifest) {
  check('manifest: nazwa, lang i start_url', manifest.name?.startsWith('Belfero') && manifest.lang === 'pl' && manifest.start_url === '/');
  check('manifest: theme_color = tło aplikacji', manifest.theme_color === '#0B0F19', String(manifest.theme_color));

  for (const icon of manifest.icons ?? []) {
    const file = path.join(ROOT, 'public', icon.src.replace(/^\//, ''));
    const exists = fs.existsSync(file);
    check(`manifest: ikonka ${icon.src} istnieje`, exists);

    if (exists) {
      const size = pngSize(file);
      check(`manifest: ${icon.src} ma rozmiar zgodny z sizes (${icon.sizes})`, size && icon.sizes === `${size.width}x${size.height}`, size ? `${size.width}x${size.height}` : 'odczyt IHDR nieudany');
    }
  }

  for (const shortcut of manifest.shortcuts ?? []) {
    const meta = resolvePageMeta(shortcut.url);
    check(`manifest: skrót ${shortcut.url} to strona publiczna`, publicRoutes().some((route) => route.path === shortcut.url), `tytuł z tabeli: ${meta.title}`);
  }
}

const ogFile = path.join(ROOT, 'public', 'og.png');
const og = fs.existsSync(ogFile) ? pngSize(ogFile) : null;
check('public/og.png istnieje', Boolean(og), ogFile);

if (og) {
  check('og.png ma 1200x630', og.width === 1200 && og.height === 630, `${og.width}x${og.height}`);
  check(
    'og:image:width i :height zgadzają się z plikiem',
    /property="og:image:width" content="1200"/.test(htmlMarkup) && /property="og:image:height" content="630"/.test(htmlMarkup)
  );
  check('og.png nie waży więcej niż 200 kB', fs.statSync(ogFile).size <= 200 * 1024, `${(fs.statSync(ogFile).size / 1024).toFixed(1)} kB`);
}

for (const name of ['robots.txt', 'llms.txt', 'humans.txt']) {
  const file = path.join(ROOT, 'public', name);
  check(`public/${name} istnieje i nie jest pusty`, fs.existsSync(file) && fs.statSync(file).size > 100);
}

const robots = read('public', 'robots.txt');
/*
 * Dyrektywy liczymy bez komentarzy: nagłówek pliku celowo cytuje przykładowy adres
 * `https://<domena>/sitemap.xml` i test na bezwzględnym adresie sprawdzałby własną instrukcję.
 */
const robotsDirectives = robots.split('\n').filter((line) => !line.trim().startsWith('#'));
check('robots.txt nie ma bezwzględnego adresu domeny', !/https?:\/\//.test(robotsDirectives.join('\n')), 'domena należy do wdrożenia');

console.log('\n== Trasy aplikacji a tabela metanych');

const appSource = read('src', 'App.tsx');
const routePaths = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map((match) => match[1]);
const publicAuth = publicRoutes().map((route) => route.path);

check('App.tsx w ogóle deklaruje trasy', routePaths.length > 10, `${routePaths.length} tras`);

for (const routePath of publicAuth) {
  check(`tabela: strona publiczna ${routePath} istnieje w App.tsx`, routePaths.includes(routePath));
}

const protectedPrefixes = protectedRoutePaths();

for (const routePath of routePaths) {
  if (publicAuth.includes(routePath) || routePath === '/' || routePath === '*') continue;

  const meta = resolvePageMeta(routePath);

  check(`tabela: ${routePath} ma własny wpis metanych`, meta.title !== 'Strona nieznaleziona', `dostało tytuł „${meta.title}"`);
  check(`robots: ${routePath} nie jest do indeksowania`, meta.indexable === false);
  check(`robots.txt: ${routePath} jest w Disallow`, robotsDirectives.some((line) => line.startsWith('Disallow:') && routePath.startsWith(line.slice(9).trim())));
}

for (const prefix of protectedPrefixes) {
  check(`tabela: prefiks ${prefix} odpowiada trasie z App.tsx`, routePaths.some((routePath) => routePath === prefix || routePath.startsWith(`${prefix}/`)));
}

console.log('\n== Długości i kształt tytułów');

const allTitles = [
  ...publicRoutes().map((route) => formatTitle(route.meta.title)),
  ...protectedPrefixes.map((prefix) => formatTitle(resolvePageMeta(prefix).title)),
];

for (const title of allTitles) {
  check(`tytuł do 60 znaków: „${title}"`, title.length <= 60, `${title.length} znaków`);
}

const fallback = resolvePageMeta('/nie-istnieje');
check('nieznany adres dostaje wpadkę bez indeksowania', fallback.indexable === false && fallback.title === 'Strona nieznaleziona');
check('adres z identyfikatorem nie jest indeksowany', resolvePageMeta('/history/0f0f/grade/1e1e').indexable === false);
check('ścieżka z ukośnikiem na końcu trafia w ten sam wpis', resolvePageMeta('/classes/').title === resolvePageMeta('/classes').title);

console.log('\n== Nagłówki i landmarki w widokach');

const pageFiles = fs
  .readdirSync(path.join(ROOT, 'src', 'pages'))
  .filter((name) => name.endsWith('.tsx'))
  .sort();

check('lista widoków nie jest pusta', pageFiles.length >= 17, `${pageFiles.length} plików`);

for (const name of pageFiles) {
  const source = read('src', 'pages', name);

  check(`widok ${name} ma <h1>`, /<h1[\s>]/.test(source), 'tytuł widoku musi być nagłówkiem najwyższego stopnia');
  check(`widok ${name} ma <main>`, /<main[\s>]/.test(source), 'czytnik ekranu trafia wtedy do treści omijając nawigację');
}

for (const name of ['BrandMark.tsx', 'Sidebar.tsx']) {
  const source = read('src', 'components', name);

  check(`powłoka ${name} nie ma <h1>`, !/<h1[\s>]/.test(source), 'element wraca na każdym widoku i dorzucałby drugi nagłówek');
}

console.log(failures ? `\nFAIL: ${failures} asercji` : '\nPASS: wszystkie asercje przeszły');
process.exit(failures ? 1 : 0);
