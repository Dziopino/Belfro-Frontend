import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RowInput } from 'jspdf-autotable';
import { assertPolishFont, preparePolishFont } from './pdfFonts';
import { LOW_CONFIDENCE_THRESHOLD } from './grading';
import type { SessionStudentGrade, SessionSummaryData, SessionTaskRow } from '../components/SessionSummaryTable';

// ============================================
// GEOMETRIA — wszystkie liczby w mm, żadnej magii przy rysowaniu
// ============================================

export const A4_W = 210;
export const A4_H = 297;

export const MARGIN_TOP = 12;
export const MARGIN_BOTTOM = 12;
export const MARGIN_X = 14;

/** Czysty pas na zszywki po lewej każdym metryczki — tam nie wolno nic rysować. */
export const GUTTER_W = 15;

export const STRIPS_PER_PAGE = 3;
export const STRIP_H = A4_H / STRIPS_PER_PAGE; // 99

const SHEET_CONTENT_W = A4_W - MARGIN_X * 2; // 182

const SLIP_CONTENT_X = MARGIN_X + GUTTER_W; // 29
const SLIP_CONTENT_W = A4_W - MARGIN_X - SLIP_CONTENT_X; // 167

const SEC1_W = 40;
const SEC2_W = 50;
const SEC3_W = SLIP_CONTENT_W - SEC1_W - SEC2_W; // 77

const SEC1_X = SLIP_CONTENT_X;
const SEC2_X = SEC1_X + SEC1_W;
const SEC3_X = SEC2_X + SEC2_W;

/** Wcięcie tekstu od granicy sekcji — dzięki temu litery nie kleją się od linii oddzielających. */
const SECTION_PAD_X = 2;
const STRIP_PAD_TOP = 5;
const STRIP_FOOTER_Y = 4;

/** Linia cięcia celowo wychodzi poza pole treści — jest wskazówką dla gilotyny, nie treścią metryczki. */
const CUT_LINE_X = 8;
const CUT_LINE_X_END = A4_W - 8;

const PT_TO_MM = 0.3527777778;
const LINE_HEIGHT_FACTOR = 1.15;

const COLOR_INK: [number, number, number] = [17, 24, 39];
const COLOR_MUTED: [number, number, number] = [100, 110, 130];
const COLOR_RULE: [number, number, number] = [229, 231, 235];
const COLOR_CUT: [number, number, number] = [209, 213, 219];
const COLOR_HEAD_FILL: [number, number, number] = [226, 230, 238];
const COLOR_ALT_FILL: [number, number, number] = [246, 248, 251];

const BRAND_FOOTER = 'Wygenerowano w Belfero.pl';
const NO_VALUE = '—';

const DEV_ASSERTIONS = import.meta.env.DEV;

// ============================================
// BŁĘDY
// ============================================

/** Kod biznesowy — UI mapuje go na polski komunikat, nigdy nie wyświetla surowego wyjątku. */
export type PdfErrorCode = 'NO_GRADES' | 'NO_SLIPS';

export class PdfPreconditionError extends Error {
  readonly code: PdfErrorCode;

  constructor(code: PdfErrorCode, message: string) {
    super(message);
    this.name = 'PdfPreconditionError';
    this.code = code;
  }
}

export class PdfLayoutError extends Error {
  constructor(reason: string) {
    super(`PdfLayoutError: ${reason}`);
    this.name = 'PdfLayoutError';
  }
}

// ============================================
// FORMATOWANIE
// ============================================

export function formatPoints(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NO_VALUE;
  return value.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NO_VALUE;
  return `${value.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// Data w kontrakcie jest ISO, żeby nazwa pliku była stabilna; na wydruku pokazujemy format PL.
function toIsoDate(sessionDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return sessionDate;

  const parsed = new Date(sessionDate);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return new Date().toISOString().slice(0, 10);
}

function formatPlDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

function shortHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/** Znaki zakazane na Windows; polskie znaki zostają — NTFS jest UTF-8. */
export function buildPdfFileName(kind: 'arkusz-zbiorczy' | 'metryczki', sessionName: string, sessionDate: string): string {
  const trimmed = sessionName.trim() || 'sesja';
  let slug = trimmed
    .replace(/[<>:"/\\|?*]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (slug.length > 60) {
    slug = `${slug.slice(0, 60)}-${shortHash(trimmed)}`;
  }

  return `belfero-${kind}-${slug}-${toIsoDate(sessionDate)}.pdf`;
}

// ============================================
// SORTOWANIE I STATUSY
// ============================================

/** Raporty idą porządkiem dziennikowym (numer naturalny, potem nazwisko), a nie kolejnością pewności AI. */
export function sortForReport(grades: SessionStudentGrade[]): SessionStudentGrade[] {
  return [...grades].sort((a, b) => {
    const byNumber = a.studentNumber.localeCompare(b.studentNumber, 'pl', { numeric: true });
    return byNumber !== 0 ? byNumber : a.studentName.localeCompare(b.studentName, 'pl');
  });
}

export function statusLabel(grade: SessionStudentGrade): string {
  if (grade.variantMissing) return 'Do wskazania';
  if (grade.finalPoints === null) return 'Nieoceniona';
  if (grade.verified) return 'Zweryfikowana';
  if (grade.confidenceScore < LOW_CONFIDENCE_THRESHOLD) return 'Wymaga weryfikacji';
  return 'Do weryfikacji nauczyciela';
}

/** Feedback dla ucznia: komentarz nauczyciela wygrywa z odpowiedzią AI. */
export function resolveFeedback(grade: SessionStudentGrade): string {
  const teacher = (grade.teacherResponse ?? '').trim();
  if (teacher) return teacher;

  const ai = grade.aiResponseFeedback.trim();
  return ai || 'Brak informacji zwrotnej.';
}

// ============================================
// POMOCNICZE RYSOWANIE
// ============================================

function setText(doc: jsPDF, font: string, size: number, style: 'normal' | 'bold', color: [number, number, number]): void {
  doc.setFont(font, style);
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
}

/** Sposób położenia gotnej linii na stronie — metryczka podstawia wersję ze strażą guttra. */
type Drawer = (doc: jsPDF, text: string, x: number, y: number) => void;

const pageText: Drawer = (doc, text, x, y) => {
  if (DEV_ASSERTIONS && x < MARGIN_X) {
    throw new PdfLayoutError(`Treść arkusza narysowana poza lewym marginesem na x=${x}`);
  }

  doc.text(text, x, y);
};

/**
 * Zmniejsza krój od `maxSize` do `minSize`, aż tekst zmieści się w `maxWidth`.
 * null, gdy nawet najmniejszy krój nie wystarcza — wtedy decyzja należy do wołającego (łamanie w linie).
 */
function fittingFontSize(doc: jsPDF, text: string, maxWidth: number, maxSize: number, minSize: number): number | null {
  for (let size = maxSize; size >= minSize; size -= 0.5) {
    doc.setFontSize(size);
    if (doc.getTextWidth(text) <= maxWidth) return size;
  }

  return null;
}

/**
 * Tekst dopasowany do szerokości w jednej linii. Etykieta, która nie mieści się nawet w najmniejszym
 * kroju, to błąd układu — lepiej fail w devie niż brzydki wydruk w produkcji.
 */
function drawFitted(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, maxSize: number, minSize: number, draw: Drawer = pageText): void {
  const size = fittingFontSize(doc, text, maxWidth, maxSize, minSize);
  if (size === null) {
    throw new PdfLayoutError(`Tekst nie mieści się w ${maxWidth} mm nawet przy ${minSize} pt`);
  }

  doc.setFontSize(size);
  draw(doc, text, x, y);
}

/**
 * Blok tekstu o z góry ustalonej liczbie linii: krój maleje, potem tekst łamie się do szerokości,
 * a nadwyżka kończy wielokropkiem. Dzięki temu długa nazwa sesji nigdy nie wywraca wydruku.
 * Zwraca bazę linii tuż za blokiem.
 */
function drawWrapped(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  maxLines: number,
  draw: Drawer = pageText
): number {
  let size = minSize;
  let lines = [text];

  for (let candidate = maxSize; candidate >= minSize; candidate -= 0.5) {
    doc.setFontSize(candidate);
    const wrapped = wrappedLines(doc, text, maxWidth);
    size = candidate;
    lines = wrapped;
    if (wrapped.length <= maxLines) break;
  }

  if (lines.length > maxLines) {
    lines = [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1].replace(/\s+$/, '')}…`];
  }

  const lineHeightMm = size * LINE_HEIGHT_FACTOR * PT_TO_MM;

  let baseline = y;
  for (const line of lines) {
    draw(doc, line, x, baseline);
    baseline += lineHeightMm;
  }

  return baseline;
}

/** Każda linia tekstu metryczki przechodzi tędy — pas na zszywki musi zostać fizycznie pusty. */
function slipText(doc: jsPDF, text: string, x: number, y: number): void {
  if (DEV_ASSERTIONS && x < GUTTER_W) {
    throw new PdfLayoutError(`Treść metryczki narysowana w guttrze na x=${x}`);
  }

  doc.text(text, x, y);
}

/** Wiersze łamane do szerokości sekcji; asercja, że żaden nie wyjeżdża za margines. */
function wrappedLines(doc: jsPDF, text: string, boxWidth: number): string[] {
  const lines = doc.splitTextToSize(text, boxWidth);
  if (!Array.isArray(lines)) return [];

  if (DEV_ASSERTIONS) {
    for (const line of lines) {
      if (doc.getTextWidth(line) > boxWidth + 0.01) {
        throw new PdfLayoutError(`Zawijanie tekstu wyszło poza ${boxWidth} mm`);
      }
    }
  }

  return lines;
}

function dashedCutLine(doc: jsPDF, y: number): void {
  doc.setDrawColor(COLOR_CUT[0], COLOR_CUT[1], COLOR_CUT[2]);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(CUT_LINE_X, y, CUT_LINE_X_END, y);
  // Znacznik przy lewej krawędzi. Świadomie narysowany liniami, nie glifem „✂”:
  // miałby wędrować po x=8 mm, czyli w strefie, której asercja treści nie pozwala użyć.
  doc.setLineDashPattern([], 0);
  doc.line(CUT_LINE_X, y - 1.5, CUT_LINE_X + 3, y);
  doc.line(CUT_LINE_X, y + 1.5, CUT_LINE_X + 3, y);
  doc.setLineWidth(0.200025);
}

function verticalRule(doc: jsPDF, x: number, yTop: number, yBottom: number): void {
  doc.setDrawColor(COLOR_RULE[0], COLOR_RULE[1], COLOR_RULE[2]);
  doc.setLineWidth(0.1);
  doc.line(x, yTop, x, yBottom);
  doc.setLineWidth(0.200025);
}

/**
 * Maksimum tej pracy, nie całej sesji: każda grupa ma własną migawkę klucza odpowiedzi,
 * a arkusz bez grup w ogóle jej nie ma — wtedy zostaje maximum z nagłówka sesji.
 */
function maxPointsOf(grade: SessionStudentGrade, sessionMax: number): number {
  return grade.maxPoints ?? sessionMax;
}

// ============================================
// PDF #1 — ARKUSZ ZBIORCZY
// ============================================

type SheetAlign = 'left' | 'center' | 'right';

/**
 * Kolumny podziału: „Grupa” z przydziału albo „Wariant” z rozpoznania — nigdy obie naraz.
 * W klasie numerowanej tożsamość mieści się w jednej kolumnie: osobne „Numer” i „Imię i nazwisko”
 * wydrukowałyby „12” i „Nr 12” obok siebie, a konto prywatne i tak nie ma nazwisk.
 */
const sheetHead = (splitLabel: string | null, numbered: boolean): string[] => {
  const identity = numbered ? ['Uczeń'] : ['Numer', 'Imię i nazwisko'];
  return splitLabel === null
    ? ['Lp.', ...identity, 'Punkty', '%', 'Ocena', 'Pewność AI', 'Status']
    : ['Lp.', ...identity, splitLabel, 'Punkty', '%', 'Ocena', 'Pewność AI', 'Status'];
};

// Wyrównanie wiążemy z nazwą kolumny, nie z jej pozycją: dodanie grupy przesuwa resztę indeksów
const SHEET_ALIGN: Record<string, SheetAlign> = {
  'Lp.': 'right',
  Numer: 'right',
  Uczeń: 'left',
  'Imię i nazwisko': 'left',
  Grupa: 'left',
  Wariant: 'left',
  Punkty: 'right',
  '%': 'right',
  Ocena: 'center',
  'Pewność AI': 'right',
  Status: 'left',
};

type SheetCell = string | { content: string; colSpan?: number };

/** Suma kolumn wiersza — cell z colSpan liczy się jak colSpan kolumn. */
function rowColumnSpan(row: readonly SheetCell[]): number {
  return row.reduce((sum, cell) => sum + (typeof cell === 'string' ? 1 : cell.colSpan ?? 1), 0);
}

/**
 * Suma musi dać SHEET_CONTENT_W (182 mm) — sprawdza to asercja w drawClassSheet.
 * Szerokości liczone od nagłówków: DejaVu bold 8,5 pt + cellPadding 2 mm z każdej strony.
 * Węższa kolumna = autoTable łamie napis w połowie słowa ("Nume" / "r"), więc każda kolumna ma
 * co najmniej szerokość własnego nagłówka, a nadwyżkę biorą "Imię i nazwisko" i "Status".
 */
const SHEET_COLUMN_W = [10, 16, 43, 16, 16, 15, 24, 42];
/** Kolumna podziału ma 18 mm, bo jej szerszy nagłówek to „Wariant" (13,4 mm tekstu). Resztę oddają nazwisko i status. */
const SHEET_COLUMN_W_WITH_SPLIT = [10, 16, 32, 18, 16, 16, 15, 24, 35];
/** Tryb numerowany: „Uczeń" dostaje sumę szerokości „Numer" + „Imię i nazwisko", więc tabela nadal ma 182 mm. */
const SHEET_COLUMN_W_NUMBERED = [10, 59, 16, 16, 15, 24, 42];
const SHEET_COLUMN_W_NUMBERED_WITH_SPLIT = [10, 48, 18, 16, 16, 15, 24, 35];

/** Kolumny arkusza zależą od dwóch rzeczy naraz: trybu listy uczniów i tego, czy sesja ma podział. */
function sheetColumnWidths(numbered: boolean, hasSplit: boolean): number[] {
  if (numbered) return hasSplit ? SHEET_COLUMN_W_NUMBERED_WITH_SPLIT : SHEET_COLUMN_W_NUMBERED;
  return hasSplit ? SHEET_COLUMN_W_WITH_SPLIT : SHEET_COLUMN_W;
}

export function drawClassSheet(doc: jsPDF, data: SessionSummaryData, font: string): void {
  if (data.grades.length === 0) {
    throw new PdfPreconditionError('NO_GRADES', 'Brak prac w tej sesji');
  }

  assertPolishFont(doc, font);

  const splitLabel = data.variantDetection ? 'Wariant' : data.grades.some((grade) => Boolean(grade.groupName)) ? 'Grupa' : null;
  const numbered = data.numbered === true;
  const splitValue = (grade: SessionStudentGrade): string => {
    if (splitLabel !== 'Wariant') return grade.groupName || NO_VALUE;
    return grade.variantName || NO_VALUE;
  };
  const head = sheetHead(splitLabel, numbered);
  const hasSplit = splitLabel !== null;
  const columnW = sheetColumnWidths(numbered, hasSplit);

  if (DEV_ASSERTIONS && columnW.reduce((sum, w) => sum + w, 0) !== SHEET_CONTENT_W) {
    throw new PdfLayoutError('Szerokości kolumn arkusza nie pokrywają pola opisu');
  }

  const iso = toIsoDate(data.sessionDate);
  const rows = sortForReport(data.grades);
  const rowMax = (grade: SessionStudentGrade): number => maxPointsOf(grade, data.maxPoints);

  const distinctMaxima = Array.from(new Set(data.grades.map(rowMax)));
  const maxLabel =
    distinctMaxima.length === 1
      ? `Maksymalnie ${formatPoints(distinctMaxima[0])} pkt`
      : `Maksymalnie: ${distinctMaxima.map(formatPoints).join(' / ')} pkt`;
  const splitNames = data.variantDetection ? data.variantNames ?? [] : data.groupNames ?? [];
  const groupsLabel =
    splitNames.length === 0
      ? ''
      : ` • ${data.variantDetection ? 'Warianty' : 'Grupy'}: ${splitNames.join(', ')}`;

  let cursorY = MARGIN_TOP + 5;

  setText(doc, font, 15, 'bold', COLOR_INK);
  cursorY = drawWrapped(doc, `Arkusz zbiorczy — ${data.sessionName}`, MARGIN_X, cursorY, SHEET_CONTENT_W, 15, 11, 2) + 2.5;

  setText(doc, font, 9.5, 'normal', COLOR_MUTED);
  const subtitle = `Klasa ${data.className} • ${formatPlDate(iso)} • ${maxLabel}${groupsLabel}`;
  cursorY = drawWrapped(doc, subtitle, MARGIN_X, cursorY, SHEET_CONTENT_W, 9.5, 8, 1) + 1.5;

  if (data.thresholdName) {
    setText(doc, font, 9, 'normal', COLOR_MUTED);
    cursorY = drawWrapped(doc, `Skala: ${data.thresholdName}`, MARGIN_X, cursorY, SHEET_CONTENT_W, 9, 8, 1) + 1.5;
  }

  cursorY += 1;

  const body: SheetCell[][] = rows.map((grade, index) => [
    String(index + 1),
    ...(numbered
      ? [grade.studentName || NO_VALUE]
      : [grade.studentNumber || NO_VALUE, grade.studentName || NO_VALUE]),
    ...(hasSplit ? [splitValue(grade)] : []),
    formatPoints(grade.finalPoints),
    formatPercent(grade.percentage),
    grade.finalGrade ?? (grade.finalPoints === null ? NO_VALUE : 'Brak oceny'),
    grade.finalPoints === null ? NO_VALUE : `${Math.round(grade.confidenceScore)}%`,
    statusLabel(grade),
  ]);

  const graded = rows.filter((grade) => grade.finalPoints !== null);
  const totalEarned = graded.reduce((sum, grade) => sum + (grade.finalPoints ?? 0), 0);
  // Mianownik sumuje maksima poszczególnych prac: warianty A/B/C mają różne sumy punktów
  const gradedMaxSum = graded.reduce((sum, grade) => sum + rowMax(grade), 0);
  const avgPercent =
    graded.length === 0 || gradedMaxSum <= 0 ? null : (totalEarned / gradedMaxSum) * 100;

  const worksSummary = `${graded.length} z ${rows.length} prac ocenionych`;
  // Kolumny przed „Punkty" są tożsamościowe; ich liczbę czyta się z nagłówka, bo scalenie w trybie
  // numerowanym i kolumna podziału przestawiają resztę indeksów.
  const identityCols = head.indexOf('Punkty');
  const foot: SheetCell[][] = [
    [
      ...(numbered
        ? [{ content: `Razem • ${worksSummary}`, colSpan: identityCols }]
        : [
            { content: 'Razem', colSpan: 2 },
            // Kolumna podziału wchodzi między nazwisko a punkty, więc podsumowanie obejmuje dwie komórki
            splitLabel !== null ? { content: worksSummary, colSpan: 2 } : worksSummary,
          ]),
      formatPoints(graded.length === 0 ? null : totalEarned / graded.length),
      formatPercent(avgPercent),
      '',
      '',
      '',
    ],
  ];

  // dryf kolumn w stopce tworzy w autoTable dziewiątą kolumnę i wypycha tabelę za margines
  if (DEV_ASSERTIONS) {
    const bad = [...body, ...foot].find((row) => rowColumnSpan(row) !== head.length);
    if (bad) {
      throw new PdfLayoutError(`Wiersz arkusza ma ${rowColumnSpan(bad)} kolumn, nagłówek ${head.length}`);
    }
  }

  autoTable(doc, {
    head: [head],
    body,
    foot,
    startY: cursorY,
    margin: { top: MARGIN_TOP, left: MARGIN_X, right: MARGIN_X, bottom: MARGIN_BOTTOM + 6 },
    tableWidth: SHEET_CONTENT_W,
    showHead: 'everyPage',
    theme: 'grid',
    styles: {
      font,
      fontSize: 9,
      fontStyle: 'normal',
      lineColor: COLOR_RULE,
      lineWidth: 0.1,
      textColor: COLOR_INK,
      cellPadding: { top: 1.4, bottom: 1.4, left: 2, right: 2 },
      halign: 'left',
      valign: 'middle',
    },
    headStyles: { font, fillColor: COLOR_HEAD_FILL, textColor: COLOR_INK, fontStyle: 'bold', fontSize: 8.5 },
    footStyles: { font, fillColor: COLOR_HEAD_FILL, textColor: COLOR_INK, fontStyle: 'bold', fontSize: 8.5 },
    columnStyles: Object.fromEntries(
      head.map((title, index) => [index, { cellWidth: columnW[index], halign: SHEET_ALIGN[title] ?? 'left' }]),
    ) as Record<number, { cellWidth: number; halign: SheetAlign }>,
    didParseCell: (cell) => {
      if (cell.section === 'body' && cell.row.index % 2 === 1) {
        cell.cell.styles.fillColor = COLOR_ALT_FILL;
      }
    },
  });

  stampSheetFooters(doc, font, iso);
}

function stampSheetFooters(doc: jsPDF, font: string, iso: string): void {
  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);

    setText(doc, font, 7, 'normal', COLOR_MUTED);
    doc.text(BRAND_FOOTER, MARGIN_X, A4_H - 8);

    const label = `Strona ${page} z ${pageCount} • wygenerowano ${formatPlDate(iso)}`;
    doc.text(label, A4_W - MARGIN_X - doc.getTextWidth(label), A4_H - 8);
  }
}

// ============================================
// PDF #2 — METRYCZKI (3 paski na stronę A4)
// ============================================

function estimateRowHeightMm(fontSizePt: number, padVerticalMm: number): number {
  return fontSizePt * LINE_HEIGHT_FACTOR * PT_TO_MM + padVerticalMm * 2;
}

/** Dobiera krój i paddingi mini tabeli tak, aby mieściła się w jednym pasku. */
function planTaskTable(taskCount: number, availableHeightMm: number): { fontSize: number; padV: number; capacity: number } {
  const attempts = [
    { fontSize: 8, padV: 0.6 },
    { fontSize: 7, padV: 0.45 },
    { fontSize: 7, padV: 0.3 },
  ];

  for (const attempt of attempts) {
    const rowHeight = estimateRowHeightMm(attempt.fontSize, attempt.padV);
    const capacity = Math.floor(availableHeightMm / rowHeight);
    // head + foot zajmują dwa wiersze — muszą się zmieścić zawsze
    if (capacity >= taskCount + 2) return { ...attempt, capacity };
  }

  const last = attempts[attempts.length - 1];
  return { ...last, capacity: Math.floor(availableHeightMm / estimateRowHeightMm(last.fontSize, last.padV)) };
}

function drawSlipSection1(doc: jsPDF, font: string, data: SessionSummaryData, grade: SessionStudentGrade, y0: number): void {
  const boxX = SEC1_X + SECTION_PAD_X;
  const boxW = SEC1_W - SECTION_PAD_X * 2;
  const iso = toIsoDate(data.sessionDate);

  setText(doc, font, 6.5, 'bold', COLOR_MUTED);
  slipText(doc, 'SESJA', boxX, y0 + STRIP_PAD_TOP + 2);

  setText(doc, font, 8, 'bold', COLOR_INK);
  let cursor = drawWrapped(doc, data.sessionName, boxX, y0 + STRIP_PAD_TOP + 6, boxW, 8, 6.5, 2, slipText);

  setText(doc, font, 8, 'normal', COLOR_MUTED);
  const workSplit = data.variantDetection ? grade.variantName : grade.groupName;
  const classLine = workSplit ? `Klasa ${data.className} • ${workSplit}` : `Klasa ${data.className}`;
  cursor = drawWrapped(doc, classLine, boxX, cursor, boxW, 8, 6.5, 1, slipText);
  drawWrapped(doc, formatPlDate(iso), boxX, cursor, boxW, 8, 6.5, 1, slipText);

  if (data.numbered === true) {
    // studentName to tu etykieta „Nr 12", a nie nazwisko — linia „Numer:" nad nią drukowałaby
    // to samo drugi raz, więc wolny pasek po niej zajmuje większy opis ucznia.
    setText(doc, font, 14, 'bold', COLOR_INK);
    drawFitted(doc, grade.studentName || NO_VALUE, boxX, y0 + 30.5, boxW, 14, 9, slipText);
  } else {
    setText(doc, font, 9, 'normal', COLOR_INK);
    drawFitted(doc, `Numer: ${grade.studentNumber || NO_VALUE}`, boxX, y0 + 26, boxW, 9, 7, slipText);

    setText(doc, font, 9, 'bold', COLOR_INK);
    const nameLines = wrappedLines(doc, grade.studentName || NO_VALUE, boxW).slice(0, 2);
    nameLines.forEach((line, index) => {
      slipText(doc, line, boxX, y0 + 30.5 + index * 3.8);
    });
  }

  setText(doc, font, 30, 'bold', COLOR_INK);
  if (grade.finalGrade === null) {
    drawFitted(doc, 'Brak oceny', boxX, y0 + 58, boxW, 12, 8, slipText);
  } else {
    const gradeLabel = grade.finalGrade;
    const size = fittingFontSize(doc, gradeLabel, boxW, 30, 16) ?? 16;
    doc.setFontSize(size);
    slipText(doc, gradeLabel, boxX + (boxW - doc.getTextWidth(gradeLabel)) / 2, y0 + 60);
  }

  setText(doc, font, 12, 'bold', COLOR_INK);
  drawFitted(doc, formatPercent(grade.percentage), boxX, y0 + 70, boxW, 12, 8, slipText);

  setText(doc, font, 8.5, 'normal', COLOR_MUTED);
  drawFitted(
    doc,
    `Punkty: ${formatPoints(grade.finalPoints)} / ${formatPoints(maxPointsOf(grade, data.maxPoints))} pkt`,
    boxX,
    y0 + 76,
    boxW,
    8.5,
    6.5,
    slipText
  );
}

function drawSlipSection2(doc: jsPDF, font: string, data: SessionSummaryData, grade: SessionStudentGrade, y0: number): void {
  const boxX = SEC2_X + SECTION_PAD_X;
  const boxW = SEC2_W - SECTION_PAD_X * 2;
  const top = y0 + STRIP_PAD_TOP;

  setText(doc, font, 6.5, 'bold', COLOR_MUTED);
  slipText(doc, 'PUNKTY ZA ZADANIA', boxX, top + 2);

  const tableTop = top + 4;
  const availableHeightMm = STRIP_H - STRIP_PAD_TOP - STRIP_FOOTER_Y - 6;

  const plan = planTaskTable(grade.tasks.length, availableHeightMm);
  let rows: RowInput[] = grade.tasks.map((task: SessionTaskRow) => [task.name, taskLine(task)]);

  if (rows.length > plan.capacity - 2) {
    const kept = Math.max(0, plan.capacity - 3);
    const hidden = rows.length - kept;
    rows = [...rows.slice(0, kept), [{ content: `… (+${hidden} zadań)`, colSpan: 2 }]];
  }

  const pagesBefore = doc.getNumberOfPages();

  autoTable(doc, {
    head: [['Zad.', 'Pkt']],
    body: rows,
    foot: [['Razem', `${formatPoints(grade.finalPoints)}/${formatPoints(maxPointsOf(grade, data.maxPoints))}`]],
    startY: tableTop,
    margin: { top: tableTop, left: boxX, right: A4_W - (SEC2_X + SEC2_W - SECTION_PAD_X), bottom: 5 },
    tableWidth: boxW,
    showHead: true,
    pageBreak: 'avoid',
    rowPageBreak: 'avoid',
    theme: 'plain',
    styles: {
      font,
      fontSize: plan.fontSize,
      fontStyle: 'normal',
      lineColor: COLOR_RULE,
      lineWidth: 0.1,
      textColor: COLOR_INK,
      cellPadding: { top: plan.padV, bottom: plan.padV, left: 1, right: 1 },
      valign: 'middle',
    },
    headStyles: { font, textColor: COLOR_MUTED, fontStyle: 'bold', fillColor: [255, 255, 255] },
    footStyles: { font, textColor: COLOR_INK, fontStyle: 'bold', fillColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: boxW - 16, halign: 'left' },
      1: { cellWidth: 16, halign: 'right' },
    },
  });

  // autoTable przełamuje stronę, gdy wiersze nie mieszczą się w polu — w metryczce to katastrofa
  if (doc.getNumberOfPages() !== pagesBefore) {
    throw new PdfLayoutError('Minitabela zadań wyszła poza pasek metryczki');
  }
}

function taskLine(task: SessionTaskRow): string {
  return `${formatPoints(task.points)}/${formatPoints(task.maxPoints)}`;
}

function drawSlipSection3(doc: jsPDF, font: string, grade: SessionStudentGrade, y0: number): void {
  const boxX = SEC3_X + SECTION_PAD_X;
  const boxW = SEC3_W - SECTION_PAD_X * 2;
  const top = y0 + STRIP_PAD_TOP;

  setText(doc, font, 6.5, 'bold', COLOR_MUTED);
  slipText(doc, 'INFORMACJA ZWROTNA', boxX, top + 2);

  const fontSize = 8.5;
  const lineHeightMm = fontSize * LINE_HEIGHT_FACTOR * PT_TO_MM;
  const firstBaseline = top + 7;
  const maxBaseline = y0 + STRIP_H - STRIP_FOOTER_Y - 2;
  const maxLines = Math.max(1, Math.floor((maxBaseline - firstBaseline) / lineHeightMm) + 1);

  // Krój musi być ustawiony PRZED łamaniem — splitTextToSize i getTextWidth mierzą w bieżącym rozmiarze
  setText(doc, font, fontSize, 'normal', COLOR_INK);

  const lines = wrappedLines(doc, resolveFeedback(grade), boxW);
  const visible = lines.slice(0, maxLines);

  if (lines.length > visible.length) {
    visible[maxLines - 1] = `${visible[maxLines - 1].replace(/\s+$/, '')}…`;
  }

  let baseline = firstBaseline;
  for (const line of visible) {
    slipText(doc, line, boxX, baseline);
    baseline += lineHeightMm;
  }
}

export function drawStudentSlips(doc: jsPDF, data: SessionSummaryData, font: string): void {
  assertPolishFont(doc, font);

  if (DEV_ASSERTIONS && Math.abs(STRIP_H * STRIPS_PER_PAGE - A4_H) > 0.001) {
    throw new PdfLayoutError('3 paski nie pokrywają wysokości strony A4');
  }

  const slips = sortForReport(data.grades).filter((grade) => grade.finalPoints !== null);
  if (slips.length === 0) {
    throw new PdfPreconditionError('NO_SLIPS', 'Brak ocenionych prac do zadrukowania');
  }

  slips.forEach((grade, index) => {
    const stripIndex = index % STRIPS_PER_PAGE;
    if (index > 0 && stripIndex === 0) doc.addPage();

    const y0 = stripIndex * STRIP_H;
    const hasCompanionOnPage = index + 1 < slips.length && (index + 1) % STRIPS_PER_PAGE !== 0;

    drawSlipSection1(doc, font, data, grade, y0);
    verticalRule(doc, SEC2_X, y0 + STRIP_PAD_TOP, y0 + STRIP_H - STRIP_FOOTER_Y - 1);
    drawSlipSection2(doc, font, data, grade, y0);
    verticalRule(doc, SEC3_X, y0 + STRIP_PAD_TOP, y0 + STRIP_H - STRIP_FOOTER_Y - 1);
    drawSlipSection3(doc, font, grade, y0);

    if (hasCompanionOnPage) {
      dashedCutLine(doc, y0 + STRIP_H);
    }
  });
}

// ============================================
// POWŁOKI ASYNCHRONICZNE (font + dokument + zapis)
// ============================================

export type PdfResult = {
  blob: Blob;
  fileName: string;
  pageCount: number;
};

function newA4Doc(): jsPDF {
  return new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
}

async function buildPdf(
  data: SessionSummaryData,
  kind: 'arkusz-zbiorczy' | 'metryczki',
  draw: (doc: jsPDF, data: SessionSummaryData, font: string) => void
): Promise<PdfResult> {
  const doc = newA4Doc();
  const font = await preparePolishFont(doc);

  draw(doc, data, font);

  return {
    blob: doc.output('blob'),
    fileName: buildPdfFileName(kind, data.sessionName, data.sessionDate),
    pageCount: doc.getNumberOfPages(),
  };
}

export function generateClassSheet(data: SessionSummaryData): Promise<PdfResult> {
  return buildPdf(data, 'arkusz-zbiorczy', drawClassSheet);
}

export function generateStudentSlips(data: SessionSummaryData): Promise<PdfResult> {
  return buildPdf(data, 'metryczki', drawStudentSlips);
}

export function savePdf(result: PdfResult): void {
  const url = URL.createObjectURL(result.blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
