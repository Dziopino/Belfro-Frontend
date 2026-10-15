/*
 * Asercje dostępności: kontrast, ruch, wskaźnik fokusu, poprawne okna modalne, nazwy kontrolek
 * i landmarki. Uruchom:
 *   npm run check:a11y        (albo: node scripts/check-a11y.mjs)
 *
 * Skrypt jest statyczny — nie odpala przeglądarki, nie zna wartości runtime. Dlatego orzeka tylko
 * o tym, co widać w źródle: tonach kolorów, atrybutach ARIA, obecności `useDialog(` przy każdym
 * `role="dialog"`, nazwach pól i przycisków tylko-z-ikoną. Rzeczy zależne od wykonania (realna
 * kolejność tabulacji, faktyczny kontrast po nadpisaniu klasy) sprawdzamy raz, ręcznie, i tu
 * zapisujemy jako inwariant, który nie może cicho urosnąć.
 *
 * Dlaczego to istnieje: WCAG psuje się pojedynczym class stringiem. Ktoś doda `text-slate-500`
 * „bo ledwo widać szare" i cały panel spada pod 4,5:1 na tle karty. Tu taka zmiana wychodzi
 * jako czerwony wynik, zanim trafi do builda.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

let failures = 0;
let passes = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passes += 1;
    console.log(`OK   ${label}`);
    return;
  }

  failures += 1;
  console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Wszystkie pliki komponentów i widoków; pomijamy testy i konfigurację. */
function collectTsx(dir, into = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectTsx(full, into);
    else if (entry.name.endsWith('.tsx')) into.push(full);
  }
  return into;
}

const TSX = collectTsx(SRC).sort();
const rel = (file) => path.relative(SRC, file).replace(/\\/g, '/');
const sourceOf = (file) => fs.readFileSync(file, 'utf8');

/**
 * Koniec znacznika: `>` dopiero poza `{ }` i poza stringami. `indexOf('>')` ucięłby znacznik
 * na pierwszej strzałce funkcji w atrybucie, np. `onClick={() => ...}`.
 */
function tagEnd(source, start) {
  let depth = 0;
  let quote = null;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];

    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ')' || ch === ']') depth -= 1;
    else if (ch === '>' && depth === 0) return i;
  }

  return source.length - 1;
}

/**
 * Widoczny tekst wnętrza JSX: `{isSaving ? 'Zapisywanie…' : 'Zapisz'}` zostawia swoje literały,
 * `<Plus className="w-5 h-5" />` znika razem z całym znacznikiem. Bez tego każdy przycisk
 * z ikoną przy etykiecie wyglądał jak pozbawiony nazwy.
 */
function textOfJsx(inner) {
  let out = '';

  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];

    if (ch === '{') {
      let depth = 0;
      let quote = null;
      let j = i;

      for (; j < inner.length; j += 1) {
        const c = inner[j];
        if (quote) {
          if (c === quote) quote = null;
          continue;
        }
        if (c === '"' || c === "'" || c === '`') {
          quote = c;
          continue;
        }
        if (c === '{') depth += 1;
        else if (c === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }

      const literals = inner.slice(i, j + 1).match(/'[^']*'|"[^"]*"|`[^`]*`/g) ?? [];
      out += `${literals.join(' ')} `;
      i = j;
      continue;
    }

    if (ch === '<') {
      i = tagEnd(inner, i);
      continue;
    }

    out += ch;
  }

  return out.replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

/* ------------------------------------------------------------------ 1. kontrast */
// Zmierzone tła aplikacji: strona #0B0F19, karta #131B2E, pole #1A2338. slate-400 daje na nich
// 6,11–7,47:1 (AA), slate-500 już tylko 3,29–4,02:1 (ledwie AA-large), slate-600 2,07–2,53:1 (FAIL).
const LOW_TEXT = /\btext-(?:slate|gray|zinc|neutral|cool-gray)-(?:500|600|700|800|900)\b/;
const LOW_PLACEHOLDER = /\bplaceholder-(?:slate|gray|zinc|neutral)-(?:100|200|300)\b/;

const lowText = [];
const lowPlaceholder = [];
const darkPrefix = [];
const purple = [];
const grayTokens = [];

for (const file of TSX) {
  const source = sourceOf(file);
  source.split('\n').forEach((line, i) => {
    const where = `${rel(file)}:${i + 1}`;
    if (LOW_TEXT.test(line)) lowText.push(where);
    if (LOW_PLACEHOLDER.test(line)) lowPlaceholder.push(where);
    if (/\bdark:/.test(line)) darkPrefix.push(where);
    if (/purple/.test(line)) purple.push(where);
    for (const m of line.matchAll(/\b(?:bg|border|ring|text|from|to)-gray-\d+(?:\/\d+)?\b/g)) {
      grayTokens.push(`${where} ${m[0]}`);
    }
  });
}

check('kontrast: zero tonów tekstu poniżej progu AA (slate/gray 500+)', lowText.length === 0, lowText.join(', '));
check('kontrast: zero placeholderów poniżej slate-400', lowPlaceholder.length === 0, lowPlaceholder.join(', '));
check('motyw: zero prefiksów `dark:` przy wyłącznie ciemnym motywie', darkPrefix.length === 0, darkPrefix.join(', '));
check('paleta: zero akcentu purple (spójność z niebieskim systemem)', purple.length === 0, purple.join(', '));

/* ------------------------------------------------------------------ 2. ograniczony ruch */
const motionLines = [];
for (const file of TSX) {
  sourceOf(file)
    .split('\n')
    .forEach((line, i) => {
      if (!/\banimate-(?:spin|pulse|bounce|ping)\b/.test(line)) return;
      if (/motion-reduce:animate-none/.test(line)) return;
      motionLines.push(`${rel(file)}:${i + 1}`);
    });
}
check('ruch: każdy `animate-*` ma parę `motion-reduce:animate-none`', motionLines.length === 0, motionLines.join(', '));

const css = read('src', 'index.css');
check('ruch: index.css zawiera blokadę `prefers-reduced-motion`', /@media \(prefers-reduced-motion: reduce\)/.test(css));
check('fokus: index.css rysuje `:focus-visible` obrysem, nie cieniem', /:focus-visible\s*\{[\s\S]*?outline:\s*2px solid/.test(css));
check('kursor: index.css ustawia `cursor: pointer` w warstwie base', /@layer base\s*\{[\s\S]*?button:not\(:disabled\)[\s\S]*?cursor:\s*pointer/.test(css));

/* ------------------------------------------------------------------ 3. okna modalne */
// Pułapka fokusu, blokada przewijania i zwrot fokusu mieszkają w jednym hooku; bez jego wywołania
// `role="dialog"` jest kłamstwem — klawiatura wychodzi spod okna w tło strony.
const dialogs = [
  { file: 'src/components/ClassSelectionModal.tsx', role: 'dialog' },
  { file: 'src/components/ConfirmDialog.tsx', role: 'alertdialog' },
];

for (const { file, role } of dialogs) {
  const source = read(...file.split('/'));
  const label = `okno ${path.basename(file)}`;
  check(`${label}: rola ${role} + aria-modal`, source.includes(`role="${role}"`) && source.includes('aria-modal="true"'));
  check(`${label}: etykieta okna przez aria-labelledby`, /aria-labelledby=\{titleId\}/.test(source) && /id=\{titleId\}/.test(source));
  check(`${label}: kontener osiągalny fokusem (tabIndex={-1})`, source.includes('tabIndex={-1}'));
  check(`${label}: pułapka fokusu z useDialog`, source.includes('useDialog('));

  const overlay = source.match(/<div\b[^>]*className="absolute inset-0 bg-black[^>]*\/?>/);
  const overlayTag = overlay ? source.slice(overlay.index, tagEnd(source, overlay.index) + 1) : '';
  check(`${label}: tło pod oknem ukryte przed czytnikiem (aria-hidden na overlayu)`, /aria-hidden="true"/.test(overlayTag));
}

check('hook useDialog istnieje i zamyka okno klawiszem Escape', /key === 'Escape'/.test(read('src', 'hooks', 'useDialog.ts')));

const csm = read('src', 'components', 'ClassSelectionModal.tsx');
check('okno klas: obszar przewijany ma rolę region z tabIndex={0}', /role="region"[\s\S]{0,160}tabIndex=\{0\}/.test(csm));

/* ------------------------------------------------------------------ 4. nawigacja */
const sidebar = read('src', 'components', 'Sidebar.tsx');
check('sidebar: hamburger ma aria-expanded i aria-controls', /aria-expanded=\{isOpen\}/.test(sidebar) && sidebar.includes('aria-controls="sidebar-panel"'));
check('sidebar: ukryty panel jest poza kolejnością tabulacji (inert)', /inert=\{isHiddenPanel\}/.test(sidebar));
check('sidebar: aktywna pozycja oznaczona aria-current="page"', /aria-current=\{active \? 'page' : undefined\}/.test(sidebar));
check('nawigacja: skip-link do #main-content istnieje', sidebar.includes('href="#main-content"'));

const app = read('src', 'App.tsx');
check('powłoka: drzewo otoczone ErrorBoundary', app.includes('<ErrorBoundary>'));
check('powłoka: RouteFocus przenosi fokus przy zmianie routu', app.includes('<RouteFocus />'));

/* ------------------------------------------------------------------ 5. landmarki i treści */
const views = TSX.filter((file) => rel(file).startsWith('pages/'));
const badViews = [];
for (const file of views) {
  const source = sourceOf(file);
  if (!/<main\b[\s\S]{0,200}?id="main-content"/.test(source)) badViews.push(`${rel(file)} brak <main id="main-content">`);
  else if (!/id="main-content"[\s\S]{0,120}tabIndex=\{-1\}/.test(source)) badViews.push(`${rel(file)} <main> bez tabIndex={-1}`);
}
check(`widoki (${views.length}): każdy ma <main id="main-content" tabIndex={-1}>`, badViews.length === 0, badViews.join(' | '));

const timeTags = [];
for (const file of TSX) {
  const source = sourceOf(file);
  for (const m of source.matchAll(/<time\b/g)) {
    const tag = source.slice(m.index, tagEnd(source, m.index) + 1);
    if (!/dateTime=/.test(tag)) timeTags.push(`${rel(file)}:${lineOf(source, m.index)}`);
  }
}
check('daty: każdy <time> ma atrybut dateTime w formacie ISO', timeTags.length === 0, timeTags.join(', '));

const badImgs = [];
for (const file of TSX) {
  const source = sourceOf(file);
  for (const m of source.matchAll(/<img\b/g)) {
    const tag = source.slice(m.index, tagEnd(source, m.index) + 1);
    if (!/alt=/.test(tag)) badImgs.push(`${rel(file)}:${lineOf(source, m.index)}`);
  }
}
check('obrazki: każdy <img> ma alt (także pusty, gdy dekoracyjny)', badImgs.length === 0, badImgs.join(', '));

/* ------------------------------------------------------------------ 6. nazwy kontrolek */
// Kontrolka bez nazwy jest dla czytnika ekranu bezimienna — placeholder NIE jest etykietą,
// bo znika z chwilą wpisania wartości.
const FORM_CONTROL = /<(input|select|textarea)\b/g;
const unnamedControls = [];
const unpairedIds = [];
let controlCount = 0;

for (const file of TSX) {
  const source = sourceOf(file);
  for (const m of source.matchAll(FORM_CONTROL)) {
    const tag = source.slice(m.index, tagEnd(source, m.index) + 1);
    if (/type=["'](?:hidden|button|submit|file)["']/.test(tag)) continue;
    controlCount += 1;
    const where = `${rel(file)}:${lineOf(source, m.index)}`;

    const openedLabels = (source.slice(0, m.index).match(/<label\b/g) || []).length;
    const closedLabels = (source.slice(0, m.index).match(/<\/label>/g) || []).length;
    if (openedLabels > closedLabels) continue;
    if (/aria-label=|aria-labelledby=/.test(tag)) continue;

    const literalId = /id="([^"]+)"/.exec(tag)?.[1];
    if (literalId) {
      const escaped = literalId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(`htmlFor="${escaped}"`).test(source)) unpairedIds.push(`${where} id="${literalId}"`);
      continue;
    }

    const dynamicId = /id=\{([^}]*)\}/.exec(tag)?.[1];
    if (dynamicId) {
      const needle = `htmlfor={${dynamicId.replace(/\s+/g, '')}}`.toLowerCase();
      if (!source.replace(/\s+/g, '').toLowerCase().includes(needle)) unpairedIds.push(`${where} id={${dynamicId.trim()}}`);
      continue;
    }

    unnamedControls.push(where);
  }
}

check(`formularze (${controlCount} kontrolek): zero bez jakiejkolwiek nazwy`, unnamedControls.length === 0, unnamedControls.join(', '));
check('formularze: zero id bez pary htmlFor', unpairedIds.length === 0, unpairedIds.join(', '));

// Przyciski tylko-z-ikoną: nazwa musi przyjść z aria-label, bo wnętrze jest puste.
// Etykiety budowanej ze zmiennej (`{confirmLabel}`) nie orzekamy statycznie — pomijamy.
const unnamedButtons = [];
let iconButtons = 0;

for (const file of TSX) {
  const source = sourceOf(file);
  for (const m of source.matchAll(/<button\b/g)) {
    const open = tagEnd(source, m.index);
    const close = source.indexOf('</button>', open);
    if (close === -1) continue;

    const inner = source.slice(open + 1, close);
    if (textOfJsx(inner)) continue;
    if (/\{\s*[A-Za-z_$][\w$.[\]]*\s*\}/.test(inner)) continue;

    iconButtons += 1;
    const tag = source.slice(m.index, open + 1);
    if (/aria-label=|aria-labelledby=|\btitle=/.test(tag)) continue;
    unnamedButtons.push(`${rel(file)}:${lineOf(source, m.index)}`);
  }
}

check(`przyciski tylko-z-ikoną (${iconButtons}): każdy ma aria-label`, unnamedButtons.length === 0, unnamedButtons.join(', '));

/* ------------------------------------------------------------------ 7. paleta
 * Sufit 11 z fazy 4 spłacony w fazie 6: osiem wystąpień gray-* (ThresholdSelection, AnswerKeyPicker)
 * przeszło na pary slate-* o tej samej luminancji. Zero oznacza, że powrót obcego tonu jest usterką,
 * a nie długiem do przeoczenia.
 */
check('paleta: zero obcych tonów gray-* na rzecz slate-*', grayTokens.length === 0, `${grayTokens.length} wystąpień`);

/* ------------------------------------------------------------------ podsumowanie */
console.log('');
if (failures) {
  console.log(`FAIL: ${failures} asercji nie przeszło (OK: ${passes})`);
  process.exit(1);
}
console.log(`PASS: wszystkie asercje przeszły (${passes})`);
