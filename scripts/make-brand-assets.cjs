/*
 * Generator zasobów marki dla crawlerów i PWA: public/og.png oraz public/icons/*.png.
 *
 * Why: logotyp Belfero istnieje tylko jako SVG (rysowany maszynowo ze zdjęcia — patrz
 * memory projektu „Brand logo"), a `og:image` i ikony manifestu muszą być rastrem. Ten skrypt
 * robi to rasterowanie raz; wynik jest commitowany, więc `npm run build` sharp-a nie potrzebuje.
 *
 * sharp nie jest zależnością frontendu (kontrakt Filipa: żadnych instalacji pakietów), więc
 * skrypt pożycza go z backendu. Backend ma sharp, bo obrabia skany prac.
 *
 * Uruchomienie (tylko gdy Filip zmieni logotyp):
 *   node scripts/make-brand-assets.cjs
 */
const fs = require('fs');
const path = require('path');

let sharp;
try {
  sharp = require(path.join(__dirname, '..', '..', 'backend', 'node_modules', 'sharp'));
} catch {
  console.error(
    'Brak sharp pod ../backend/node_modules/sharp. Uruchom najpierw instalację backendu — ' +
      'ten skrypt celowo nie instaluje niczego sam.'
  );
  process.exit(1);
}

const MARK = path.join(__dirname, '..', 'src', 'assets', 'belfero-mark.svg');
const LOGO = path.join(__dirname, '..', 'src', 'assets', 'belfero-logo.svg');
const OUT_DIR = path.join(__dirname, '..', 'public');
const ICON_DIR = path.join(OUT_DIR, 'icons');

/** Tło aplikacji — `bg-[#0B0F19]` na stronach logowania i rejestracji (LoginPage.tsx:168). */
const BACKGROUND = '#0B0F19';
/** Żółty z wektora logo: `fill="rgb(252,223,93)"` pierwszy path w obu plikach SVG. */
const ACCENT = '#FCDF5D';

/**
 * Wycina zawartość `<svg>` bez otaczającego tagu i zwraca razem z viewBoxem, żeby dało się
 * ją umieścić w innym kandrze przez `transform`.
 */
function readSvg(file) {
  const text = fs.readFileSync(file, 'utf8');
  const viewBox = /viewBox="([\d.\s-]+)"/.exec(text);

  if (!viewBox) throw new Error(`Brak viewBox w ${file}`);

  const body = text
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim();

  const [, , w, h] = viewBox[1].split(/\s+/).map(Number);
  return { body, width: w, height: h };
}

/**
 * Rasteryzuje złożony SVG do dokładnie `size` pikseli. `scale` liczymy z marginesem `pad`
 * (ułamki szerokości/wysokości kandru), a nie z gęstości, bo sharp skaluje SVG po `width`/`height`
 * atrybutach, nie po viewBoxie.
 */
async function raster(canvas, file, size) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}">${canvas}</svg>`;

  await sharp(Buffer.from(svg, 'utf8')).png().toFile(file);
  return file;
}

function placed(source, boxSize, pad) {
  const scale = (boxSize - 2 * pad) / Math.max(source.width, source.height);
  const drawW = source.width * scale;
  const drawH = source.height * scale;
  const tx = (boxSize - drawW) / 2;
  const ty = (boxSize - drawH) / 2;

  return `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">${source.body}</g>`;
}

async function main() {
  fs.mkdirSync(ICON_DIR, { recursive: true });

  const mark = readSvg(MARK);
  const logo = readSvg(LOGO);

  const icons = [
    { file: path.join(ICON_DIR, 'icon-192.png'), size: 192, pad: 24 },
    { file: path.join(ICON_DIR, 'icon-512.png'), size: 512, pad: 56 },
    // Maskable: strefa bezpieczna to środkowe 80% kwadratu, więc margines musi być większy.
    { file: path.join(ICON_DIR, 'icon-maskable-512.png'), size: 512, pad: 102 },
  ];

  for (const icon of icons) {
    const canvas =
      `<rect width="${icon.size}" height="${icon.size}" fill="${BACKGROUND}"/>` +
      placed(mark, icon.size, icon.pad);
    await raster(canvas, icon.file, icon.size);
  }

  // Karta udostępnienia 1200x630: lockup marki + hasło z BrandMark.tsx:19, na tle aplikacji.
  const ogW = 1200;
  const ogH = 630;
  const logoScale = 0.9;
  const logoW = logo.width * logoScale;
  const logoH = logo.height * logoScale;
  const tagline = 'AI sprawdza za Ciebie';

  const ogSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ogW}" height="${ogH}" viewBox="0 0 ${ogW} ${ogH}">` +
    `<rect width="${ogW}" height="${ogH}" fill="${BACKGROUND}"/>` +
    `<g transform="translate(${((ogW - logoW) / 2).toFixed(2)} ${((ogH - logoH) / 2 - 60).toFixed(2)}) scale(${logoScale})">${logo.body}</g>` +
    `<text x="${ogW / 2}" y="${(ogH / 2 + 120).toFixed(0)}" text-anchor="middle" ` +
    `font-family="Segoe UI, DejaVu Sans, sans-serif" font-size="52" font-weight="600" ` +
    `letter-spacing="1" fill="${ACCENT}">${tagline}</text>` +
    `<text x="${ogW / 2}" y="${(ogH / 2 + 190).toFixed(0)}" text-anchor="middle" ` +
    `font-family="Segoe UI, DejaVu Sans, sans-serif" font-size="34" fill="#94A3B8">` +
    `Ocena prac pisemnych dla nauczycieli</text>` +
    `</svg>`;

  await sharp(Buffer.from(ogSvg, 'utf8')).flatten({ background: BACKGROUND }).png().toFile(path.join(OUT_DIR, 'og.png'));

  for (const icon of icons) {
    const meta = await sharp(icon.file).metadata();
    console.log(`${path.basename(icon.file).padEnd(24)} ${meta.width}x${meta.height} ${(fs.statSync(icon.file).size / 1024).toFixed(1)} kB`);
  }

  const og = await sharp(path.join(OUT_DIR, 'og.png')).metadata();
  console.log(`${'og.png'.padEnd(24)} ${og.width}x${og.height} ${(fs.statSync(path.join(OUT_DIR, 'og.png')).size / 1024).toFixed(1)} kB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
