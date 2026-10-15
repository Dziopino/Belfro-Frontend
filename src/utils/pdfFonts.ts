import { jsPDF } from 'jspdf';

/**
 * Rodzina fontu z pełnym pokryciem polskich diakrytyków. Standardowe fonty jsPDF
 * (helvetica/times/courier) kodują w WinAnsi/cp1252, w którym nie ma ą ę ś ź ż ć ń ł,
 * więc każdy tekst w PDF-ie musi iść przez font TTF zarejestrowany tutaj.
 */
export const POLISH_FONT_FAMILY = 'belfero';

export type LoadedFont = {
  vfsName: string;
  base64: string;
  style: 'normal' | 'bold';
};

const FONT_FILES: ReadonlyArray<{ url: string; vfsName: string; style: 'normal' | 'bold' }> = [
  { url: '/fonts/DejaVuSans.ttf', vfsName: 'DejaVuSans.ttf', style: 'normal' },
  { url: '/fonts/DejaVuSans-Bold.ttf', vfsName: 'DejaVuSans-Bold.ttf', style: 'bold' },
];

// Btoa na stringu binarnym — czcionki to pliki rzędu 700 kB, jeden String.fromCharCode(...)
// z pełną tablicą roznosi stos, więc czunkujemy po 0x8000 bajtów.
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }

  return btoa(binary);
}

let cache: Promise<LoadedFont[]> | null = null;

async function fetchFont(file: (typeof FONT_FILES)[number]): Promise<LoadedFont> {
  let response: Response;

  try {
    response = await fetch(file.url);
  } catch {
    throw new Error('FONT_LOAD_FAILED');
  }

  if (!response.ok) throw new Error('FONT_LOAD_FAILED');

  return {
    vfsName: file.vfsName,
    base64: toBase64(new Uint8Array(await response.arrayBuffer())),
    style: file.style,
  };
}

/*
 * Pliki lecą równolegle: regularny i pogrubiony to razem 1 462 kB, a serialne `for … await fetch`
 * kazałoby czekać na sumę dwóch transferów. Kolejność wyników zostaje ta sama co w FONT_FILES,
 * bo `Promise.all` zwraca rezultaty w kolejności tablicy, nie w kolejności zakończenia żądań.
 * Błędu nie keszujemy — inaczej jedno
 * przejście bez sieci zatrułoby każdy następny eksport PDF w tej sesji.
 */
export function loadPolishFonts(): Promise<LoadedFont[]> {
  if (!cache) {
    cache = Promise.all(FONT_FILES.map(fetchFont)).catch((err) => {
      cache = null;
      throw err;
    });
  }

  return cache;
}

// Czyste, bez sieci — dzięki temu da się to przetestować poza przeglądarką.
export function registerPolishFonts(doc: jsPDF, fonts: LoadedFont[]): string {
  for (const font of fonts) {
    doc.addFileToVFS(font.vfsName, font.base64);
    // Trzy argumenty celowo: w jspdf 4.2.1 encoding domyślnie wynosi Identity-H
    // (2-bajtowe CID + ToUnicode). Przy WinAnsiEncoding diakrytyki powyżej 0xFF giną.
    doc.addFont(font.vfsName, POLISH_FONT_FAMILY, font.style);
  }

  return POLISH_FONT_FAMILY;
}

export async function preparePolishFont(doc: jsPDF): Promise<string> {
  return registerPolishFonts(doc, await loadPolishFonts());
}

export function assertPolishFont(doc: jsPDF, family: string): void {
  const styles = doc.getFontList()[family];
  if (!styles || !styles.includes('normal') || !styles.includes('bold')) {
    throw new Error('FONT_LOAD_FAILED');
  }
}
