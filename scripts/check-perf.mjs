/*
 * Asercje budżetu pakietu i leniwego ładowania. Uruchom:
 *   npm run check:perf       (albo: node scripts/check-perf.mjs)
 *
 * Skrypt czyta źródła (`src/App.tsx`, `src/components/RouteFallback.tsx`, `src/components/RouteFocus.tsx`,
 * `vite.config.ts`, wszystkie `src/**` z znacznikami `<img>`) oraz — jeśli istnieją — artefakty
 * z `dist/`. Nic nie buduje i niczego nie zapisuje; na brak `dist/` reaguje pominięciem grupy
 * asercji, nie błędem.
 *
 * Dlaczego to istnieje: rozmiar pakietu startowego psuje się bez ostrzeżenia. Wystarczy jeden
 * `import GradingQueuePage from './pages/GradingQueuePage'` w nowej trasie albo jedno statyczne
 * `import { jsPDF }`, żeby krytyczny JavaScript urósł ze 105 kB do 178 kB gzip — i żaden test
 * tego nie złapie, bo aplikacja nadal działa. Tu taki wpis wychodzi jako czerwony wynik.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

/*
 * Zmierzone w tej fazie po cięciu tras i groupach: 321,6 KiB zminifikowanego / 105,03 KiB gzip
 * w 5 requestach (`dist/index.html` plus jego `modulepreload`), czyli 329,35 kB / 107,55 kB
 * w dziesiętnych kB, tak jak raportuje `vite build`. Sufit 120 KiB zostawia ~15 KiB zapasu,
 * a mimo to łapie powrót do jednego pakietu na wszystko — przed cięciem było 173,8 KiB gzip.
 */
const CRITICAL_GZIP_CEILING_KIB = 120;

/*
 * Obrazy czytane eager, bo tak musi być: każdy jest tu wymieniony z uzasadnieniem. Lista ma sztywną
 * długość — dopisanie kolejnej pozycji to świadoma decyzja, nie przeoczenie.
 */
const EAGER_IMAGES = [
  { file: 'src/components/BrandMark.tsx', src: '{logoUrl}', why: 'logo nad linią wzroku na ekranie logowania' },
  { file: 'src/components/Sidebar.tsx', src: '{markUrl}', why: 'znak w nagłówku panelu, widoczny przy pierwszym malowaniu' },
  { file: 'src/components/GradingQueue.tsx', src: '{imagePreview}', why: 'źródło przycinania — ReactCrop liczy siatkę na już zdekodowanym obrazie' },
];

let failures = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`OK   ${label}`);
    return;
  }

  failures += 1;
  console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

function skip(label, detail) {
  console.log(`POM  ${label} — ${detail}`);
}

/** Koniec znacznika, z pominięciem `>` w cudzysłowach i w wyrażeniach `{}`. */
function tagEnd(source, from) {
  let depth = 0;
  let quote = null;

  for (let i = from; i < source.length; i++) {
    const ch = source[i];

    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) return i;
  }

  return -1;
}

function collectFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectFiles(full);
      return /\.(tsx|ts)$/.test(entry.name) ? [full] : [];
    })
    .sort();
}

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

/** Każdy <img> w src/: plik, linia i pełny znacznik. */
function images() {
  const out = [];

  for (const file of collectFiles(path.join(ROOT, 'src'))) {
    const source = fs.readFileSync(file, 'utf8');
    const relative = path.relative(ROOT, file).replace(/\\/g, '/');
    let at = source.indexOf('<img');

    while (at !== -1) {
      const end = tagEnd(source, at + 4);
      const tag = end === -1 ? source.slice(at) : source.slice(at, end + 1);
      out.push({ file: relative, line: lineOf(source, at), tag });
      at = source.indexOf('<img', end === -1 ? at + 4 : end);
    }
  }

  return out;
}

const app = read('src/App.tsx');
const fallback = read('src/components/RouteFallback.tsx');
const routeFocus = read('src/components/RouteFocus.tsx');
const viteConfig = read('vite.config.ts');
const queueSource = read('src/components/GradingQueue.tsx');

const pageNames = fs
  .readdirSync(path.join(ROOT, 'src/pages'))
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => f.replace(/\.tsx$/, ''))
  .sort();

console.log('== Cięcie pakietu po trasach');

check(
  `App.tsx nie importuje żadnego widoku eagerly (${pageNames.length} stron)`,
  !/import[^;\n]*from\s+'[^']*\/pages\//.test(app),
  'statyczny import strony wciąga ją z powrotem do pakietu startowego'
);

const lazyPages = [...app.matchAll(/lazy\(\s*\(\)\s*=>\s*import\(['"][^'"]*\/pages\/([A-Za-z]+)['"]\s*\)/g)]
  .map((m) => m[1])
  .sort();

const notLazy = pageNames.filter((name) => !lazyPages.includes(name));

check(
  `każdy widok jest za granicą lazy() (${pageNames.length})`,
  notLazy.length === 0 && lazyPages.length === pageNames.length,
  notLazy.length ? `poza granicą: ${notLazy.join(', ')}` : `liczby się rozjadły: ${lazyPages.length} lazy vs ${pageNames.length} plików`
);

check(
  '<Routes> siedzi w granicy Suspense z fallbackiem widoku',
  /<Suspense fallback=\{<RouteFallback \/>\}>[\s\S]*<Routes>/.test(app),
  'lazy import bez fallbacku da biały ekran w chwili nawigacji'
);

check('ErrorBoundary obejmuje granicę Suspense', /<ErrorBoundary>[\s\S]*<Suspense/.test(app));

console.log('== Ekran czekający');

check(
  'RouteFallback ogłasza stan przez role="status" i aria-live',
  /role="status"/.test(fallback) && /aria-live="polite"/.test(fallback)
);

/*
 * Bez komentarzy: docblock RouteFallback przytacza `id="main-content"` właśnie po to, żeby
 * wyjaśnić, dlaczego go tam nie ma. Orzekamy o kodzie, nie o tym, co ktoś napisał w objaśnieniu.
 */
const fallbackCode = fallback.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

check(
  'RouteFallback nie powtarza id="main-content"',
  !/id="main-content"/.test(fallbackCode),
  'powtórzony identyfikator skierowałby skip-link w dwa miejsca naraz'
);

check(
  'spinner fallbacku ma parę motion-reduce:animate-none',
  !/animate-/.test(fallback) || /animate-spin motion-reduce:animate-none/.test(fallback)
);

console.log('== Fokus po nawigacji do widoku doczytywanego');

check("RouteFocus szuka #main-content", /getElementById\('main-content'\)/.test(routeFocus));

check(
  'RouteFocus dogląda drzewa, gdy <main> jeszcze nie wyszło z pakietu',
  /new MutationObserver\(/.test(routeFocus) && /observe\(/.test(routeFocus),
  'bez tego fokus stanąłby na szczycie dokumentu przy każdej nowej trasie'
);

check(
  'RouteFocus zamyka obserwatora',
  /observer\.disconnect\(\)/.test(routeFocus),
  'obserwator bez disconnectu zostałby w drzewie na całą sesję'
);

check(
  'RouteFocus ma limit czekania na pakiet',
  /setTimeout\(/.test(routeFocus) && /clearTimeout\(/.test(routeFocus),
  'gdy chunk nie dojdzie (404 po redeployu), obserwator wisiałby bezterminowo'
);

console.log('== Stabilność cache podziału vendorów');

for (const label of ['advancedChunks', 'react-dom', 'react-router', 'axios', 'lucide-react']) {
  check(`vite.config grupuje ${label} we własnym chunku`, viteConfig.includes(label), 'bez groupy biblioteka jedzie w pakiecie startowym aplikacji');
}

console.log('== Obrazy');

const found = images();

check(`znalezione znaczniki <img> w źródłach (${found.length})`, found.length > 0);

const unaccounted = found.filter(
  (img) => !EAGER_IMAGES.some((e) => e.file === img.file && img.tag.includes(`src=${e.src}`)) && !/loading="lazy"/.test(img.tag)
);

check(
  `każdy <img> spoza listy eager ma loading="lazy" (${found.length} znaczników, ${EAGER_IMAGES.length} wyjątków)`,
  unaccounted.length === 0,
  unaccounted.map((i) => `${i.file}:${i.line}`).join(', ')
);

const lazyNoDecode = found.filter((img) => /loading="lazy"/.test(img.tag) && !/decoding="async"/.test(img.tag));

check(
  `każdy leniwy <img> dekoduje asynchronicznie (${lazyNoDecode.length} braków)`,
  lazyNoDecode.length === 0,
  lazyNoDecode.map((i) => `${i.file}:${i.line}`).join(', ')
);

check(
  'źródło przycinania NIE jest leniwe',
  /src=\{imagePreview\}/.test(queueSource) && !/src=\{imagePreview\}[\s\S]{0,200}loading="lazy"/.test(queueSource),
  'leniwe źródło przycinania dałoby ReactCrop zerowe wymiary w pierwszej klatce'
);

console.log('== Połączenie z originem API przed pierwszym żądaniem');

const shell = read('index.html');

check('index.html wstawia preconnect do API', /preconnect/.test(shell) && /apiConfigured/.test(shell));
check(
  'preconnect jest warunkowany pełnym adresem',
  /'%VITE_API_URL%'/.test(shell) && /test\(apiConfigured\)/.test(shell),
  'bez testu adresu wstawialibyśmy link z literałem %VITE_API_URL% — żądanie o 404 w konsoli'
);
check("preconnect ma crossorigin='anonymous'", /crossOrigin\s*=\s*'anonymous'/.test(shell), 'CORS bez poświadczeń nie dzieli połączenia z preconnect bez tego atrybutu');

const distHtml = path.join(ROOT, 'dist/index.html');

console.log('== Artefakty z dist/');

if (!fs.existsSync(distHtml)) {
  skip('budżet pakietu startowego', 'brak dist/index.html — uruchom npm run build, żeby zmierzyć krytyczny zestaw');
  skip('własny chunk na każdy widok', 'brak dist/index.html');
} else {
  const html = fs.readFileSync(distHtml, 'utf8');
  const critical = [
    ...[...html.matchAll(/<script type="module"[^>]*src="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/<link rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => m[1]),
  ];

  let minBytes = 0;
  let gzipBytes = 0;
  let criticalText = '';

  for (const ref of critical) {
    const file = path.join(ROOT, 'dist', ref.replace(/^\//, ''));
    if (!fs.existsSync(file)) continue;
    const buf = fs.readFileSync(file);
    minBytes += buf.length;
    gzipBytes += zlib.gzipSync(buf).length;
    criticalText += buf.toString('utf8');
  }

  const gzipKib = gzipBytes / 1024;

  console.log(
    `     pomiar: ${(minBytes / 1024).toFixed(1)} KiB min / ${gzipKib.toFixed(2)} KiB gzip w ${critical.length} requestach (gzip na plik, poziom 6)`
  );

  check(`krytyczny JavaScript mieści się w ${CRITICAL_GZIP_CEILING_KIB} KiB gzip`, gzipKib <= CRITICAL_GZIP_CEILING_KIB, `pomiar ${gzipKib.toFixed(2)}`);

  const heavy = [
    ['jsPDF', /jsPDF|jspdf/],
    ['html2canvas', /html2canvas/],
    ['ReactCrop', /ReactCrop|react-image-crop/],
  ].filter(([, re]) => re.test(criticalText));

  check(
    `pakiet startowy nie niesie ciężkich bibliotek (${heavy.length ? heavy.map((h) => h[0]).join(', ') : 'czysto'})`,
    heavy.length === 0
  );

  const chunkFiles = fs.readdirSync(path.join(ROOT, 'dist/assets')).filter((f) => f.endsWith('.js'));
  const orphanPages = pageNames.filter((name) => !chunkFiles.some((f) => f.startsWith(`${name}-`)));

  check(
    `każdy widok ma własny chunk w dist (${pageNames.length})`,
    orphanPages.length === 0,
    `bez własnego pliku: ${orphanPages.join(', ')}`
  );
}

console.log('');

if (failures > 0) {
  console.log(`FAIL: ${failures} asercji nie przeszło`);
  process.exit(1);
}

console.log('PASS: wszystkie asercje przeszły');
