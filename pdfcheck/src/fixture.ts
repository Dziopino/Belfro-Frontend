import * as fs from 'fs';
import * as path from 'path';
import { jsPDF } from 'jspdf';
import { registerPolishFonts } from './utils/pdfFonts';
import { drawClassSheet, drawStudentSlips } from './utils/sessionPdf';
import type { SessionStudentGrade, SessionSummaryData } from './components/SessionSummaryTable';

const FONT_DIR = path.resolve(__dirname, '../../public/fonts');
const OUT_DIR = path.resolve(__dirname, '../out');

function font(name: string, style: 'normal' | 'bold') {
  return { vfsName: name, base64: fs.readFileSync(path.join(FONT_DIR, name)).toString('base64'), style };
}

function makeDoc(): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  registerPolishFonts(doc, [
    font('DejaVuSans.ttf', 'normal'),
    font('DejaVuSans-Bold.ttf', 'bold'),
  ]);
  return doc;
}

function spyText(doc: jsPDF): string[] {
  const drawn: string[] = [];
  const original = doc.text.bind(doc);

  // autoTable też rysuje przez doc.text, więc podstawienie łapie każdy napis na stronie
  (doc as any).text = (text: string | string[], x: number, y: number, options?: unknown) => {
    (Array.isArray(text) ? text : [text]).forEach((item) => drawn.push(String(item)));
    return (original as any)(text, x, y, options);
  };

  return drawn;
}

function dump(drawn: string[]): void {
  console.log(`     rysowane napisy: ${drawn.map((line, index) => `${index}: ${JSON.stringify(line)}`).join('\n     ')}`);
}

function expectText(label: string, drawn: string[], required: string[]): void {
  const missing = required.filter((needle) => !drawn.some((line) => line.includes(needle)));
  if (missing.length > 0) {
    console.log(`FAIL ${label}: brak napisów ${JSON.stringify(missing)}`);
    dump(drawn);
    process.exitCode = 1;
    return;
  }
  console.log(`OK   napisy: ${label}`);
}

function expectAbsent(label: string, drawn: string[], forbidden: string[]): void {
  const found = forbidden.filter((needle) => drawn.some((line) => line.includes(needle)));
  if (found.length > 0) {
    console.log(`FAIL ${label}: nieoczekiwane napisy ${JSON.stringify(found)}`);
    dump(drawn);
    process.exitCode = 1;
    return;
  }
  console.log(`OK   brak napisów: ${label}`);
}

/** Wąska kolumna łamie nagłówek w połowie słowa („Waria" / „nt"), a includes() i tak przechodzi — tu sprawdzamy cały napis. */
function expectWhole(label: string, drawn: string[], required: string[]): void {
  const broken = required.filter((word) => !drawn.includes(word));
  if (broken.length > 0) {
    console.log(`FAIL ${label}: napisy pocięte w połowie słowa ${JSON.stringify(broken)}`);
    dump(drawn);
    process.exitCode = 1;
    return;
  }
  console.log(`OK   całe napisy: ${label}`);
}

/** Licznik dokładny: „Do wskazania" ma być przy jednej pracy, a przy dwóch znaczy, że stan z
 *  ponownym rozpoznaniem został pomylony ze stanem czekającym na kliknięcie nauczyciela. */
function expectCount(label: string, drawn: string[], text: string, expected: number): void {
  const actual = drawn.filter((line) => line === text).length;
  if (actual !== expected) {
    console.log(`FAIL ${label}: napis ${JSON.stringify(text)} wyszedł ${actual}×, a miał ${expected}×`);
    dump(drawn);
    process.exitCode = 1;
    return;
  }
  console.log(`OK   liczba napisów: ${label}`);
}

const task = (name: string, points: number, maxPoints: number) => ({ name, points, maxPoints, edited: false });

const student = (over: Partial<SessionStudentGrade>): SessionStudentGrade => ({
  studentNumber: '—',
  studentName: '—',
  finalGrade: null,
  finalPoints: null,
  percentage: null,
  aiResponseFeedback: '',
  tasks: [],
  verified: false,
  confidenceScore: 90,
  ...over,
});

// Świadomie polskie nazwiska i oceny: każdy brak diakrytyku widać potem w rendering PDF
const GROUPED: SessionSummaryData = {
  sessionName: 'Sprawdzian z ułamków — grupa A i B',
  className: '3B Gimnazjum',
  sessionDate: '2026-10-14',
  maxPoints: 24,
  thresholdName: 'Skala 1-6',
  groupNames: ['A', 'B'],
  grades: [
    student({
      studentNumber: '5',
      studentName: 'Żaneta Łącka-Ślązak',
      finalGrade: '4',
      finalPoints: 21.5,
      percentage: 89.583,
      groupName: 'A',
      maxPoints: 24,
      tasks: [task('Zad 1', 5, 5), task('Zad 2 (krótka odpowiedź)', 3.5, 4), task('Zad 3', 13, 15)],
      aiResponseFeedback: 'Dobre rozumienie, błąd rachunkowy w zadaniu 2.',
      confidenceScore: 93,
    }),
    student({
      studentNumber: '12',
      studentName: 'Miłosz Dziedzic',
      finalGrade: '3',
      finalPoints: 13,
      percentage: 65,
      groupName: 'B',
      maxPoints: 20,
      tasks: [task('Zad 1', 5, 5), task('Zad 2', 2, 4), task('Zad 3', 6, 11)],
      aiResponseFeedback: 'Zadanie 3 nierozwiązane — brak odpowiedzi.',
      confidenceScore: 62,
    }),
    student({
      studentNumber: '13',
      studentName: 'Nieoceniona Praca',
      groupName: 'A',
      maxPoints: 24,
      confidenceScore: 0,
    }),
  ],
};

const UNGROUPED: SessionSummaryData = {
  sessionName: 'Kartkówka z potęg',
  className: '3B Gimnazjum',
  sessionDate: '2026-10-14',
  maxPoints: 24,
  thresholdName: 'Skala 1-6',
  grades: [
    student({
      studentNumber: '1',
      studentName: 'Anna Ćwiklińska',
      finalGrade: '5',
      finalPoints: 24,
      percentage: 100,
      tasks: [task('Zad 1', 12, 12), task('Zad 2', 12, 12)],
      aiResponseFeedback: 'Wszystko poprawnie.',
      confidenceScore: 97,
      verified: true,
    }),
    student({
      studentNumber: '2',
      studentName: 'Borys Wąż',
      finalGrade: '2',
      finalPoints: 8,
      percentage: 33.333,
      tasks: [task('Zad 1', 4, 12), task('Zad 2', 4, 12)],
      aiResponseFeedback: 'Brak skrócenia ułamka.',
      confidenceScore: 81,
    }),
  ],
};

// Sesja z rozpoznawaniem wariantów przez AI: brak przydziału, kolumna „Wariant” zamiast „Grupa”
const VARIANTS: SessionSummaryData = {
  sessionName: 'Sprawdzian z ułamków — AI wybiera wariant',
  className: '3B Gimnazjum',
  sessionDate: '2026-10-14',
  maxPoints: 24,
  thresholdName: 'Skala 1-6',
  variantDetection: true,
  variantNames: ['A', 'B'],
  grades: [
    student({
      studentNumber: '5',
      studentName: 'Żaneta Łącka-Ślązak',
      finalGrade: '4',
      finalPoints: 21.5,
      percentage: 89.583,
      variantName: 'A',
      maxPoints: 24,
      tasks: [task('Zad 1', 5, 5), task('Zad 2 (krótka odpowiedź)', 3.5, 4), task('Zad 3', 13, 15)],
      aiResponseFeedback: 'Dobre rozumienie, błąd rachunkowy w zadaniu 2.',
      confidenceScore: 91,
    }),
    student({
      studentNumber: '12',
      studentName: 'Miłosz Dziedzic',
      finalGrade: '3',
      finalPoints: 13,
      percentage: 65,
      variantName: 'B',
      maxPoints: 20,
      tasks: [task('Zad 1', 5, 5), task('Zad 2', 2, 4), task('Zad 3', 6, 11)],
      aiResponseFeedback: 'Zadanie 3 nierozwiązane — brak odpowiedzi.',
      confidenceScore: 88,
    }),
    student({
      studentNumber: '13',
      studentName: 'Nie rozpoznana Praca',
      variantMissing: true,
      maxPoints: 24,
      confidenceScore: 0,
    }),
    // Drugi stan braku wariantu: klasyfikacja nie leciała albo padło samo wywołanie, więc praca
    // czeka na najbliższe sprawdzanie sesji, a nie na kliknięcie nauczyciela. Na wydruku nie ma
    // prawa wyglądać jak „Do wskazania".
    student({
      studentNumber: '14',
      studentName: 'Praca Do Rozpoznania',
      maxPoints: 24,
      confidenceScore: 0,
    }),
  ],
};

function save(doc: jsPDF, fileName: string): number {
  const bytes = Buffer.from(doc.output('arraybuffer') as ArrayBuffer);
  fs.writeFileSync(path.join(OUT_DIR, fileName), bytes);
  return bytes.length;
}

function check(label: string, run: () => void): void {
  try {
    run();
    console.log(`OK   ${label}`);
  } catch (err) {
    console.log(`FAIL ${label}: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });

check('arkusz zbiorczy bez grup', () => {
  const doc = makeDoc();
  const drawn = spyText(doc);
  drawClassSheet(doc, UNGROUPED, 'belfero');
  console.log(`     strony=${doc.getNumberOfPages()} plik=${save(doc, 'sheet-ungrouped.pdf')} B`);
  expectAbsent('arkusz bez grup', drawn, ['Grupa', 'Grupy:']);
  expectText('nagłówki bez grup', drawn, ['Numer', 'Ocena', 'Pewność AI', 'Status']);
  expectWhole('nagłówki bez grup w całości', drawn, ['Lp.', 'Numer', 'Imię i nazwisko', 'Pewność AI', 'Status']);
});

check('arkusz zbiorczy z grupami (różne maksima 24/20)', () => {
  const doc = makeDoc();
  const drawn = spyText(doc);
  drawClassSheet(doc, GROUPED, 'belfero');
  console.log(`     strony=${doc.getNumberOfPages()} plik=${save(doc, 'sheet-grouped.pdf')} B`);
  expectText('arkusz z grupami', drawn, [
    'Grupa',
    'Numer',
    'Pewność AI',
    'Ocena',
    '24,0 / 20,0',
    'Grupy: A, B',
    'Łącka-Ślązak',
  ]);
  expectWhole('arkusz z grupami w całości', drawn, ['Grupa', 'Pewność AI', 'Status']);
});

check('metryczki bez grup', () => {
  const doc = makeDoc();
  const drawn = spyText(doc);
  drawStudentSlips(doc, UNGROUPED, 'belfero');
  console.log(`     strony=${doc.getNumberOfPages()} plik=${save(doc, 'slips-ungrouped.pdf')} B`);
  expectAbsent('metryczki bez grup', drawn, ['Grupa', ' • B']);
});

check('metryczki z grupami', () => {
  const doc = makeDoc();
  const drawn = spyText(doc);
  drawStudentSlips(doc, GROUPED, 'belfero');
  console.log(`     strony=${doc.getNumberOfPages()} plik=${save(doc, 'slips-grouped.pdf')} B`);
  expectText('metryczki z grupami', drawn, ['Klasa 3B Gimnazjum • B', '13,0 / 20,0 pkt', '21,5 / 24,0 pkt']);
});

check('arkusz zbiorczy z rozpoznanymi wariantami', () => {
  const doc = makeDoc();
  const drawn = spyText(doc);
  drawClassSheet(doc, VARIANTS, 'belfero');
  console.log(`     strony=${doc.getNumberOfPages()} plik=${save(doc, 'sheet-variants.pdf')} B`);
  expectAbsent('arkusz z wariantami nie używa grup', drawn, ['Grupa', 'Grupy:']);
  expectText('arkusz z wariantami', drawn, [
    'Wariant',
    'Warianty: A, B',
    'Do wskazania',
    '24,0 / 20,0',
    'Łącka-Ślązak',
  ]);
  expectWhole('arkusz z wariantami w całości', drawn, ['Wariant', 'Do wskazania', 'Pewność AI', 'Status']);
  // 'Do wskazania' tylko przy pracy, której model odmówił rozstrzygnięcia; praca po nieudanym
  // wywołaniu rozpoznania jest zwykłą pracą oczekującą na sprawdzenie sesji → 'Nieoceniona' raz.
  expectCount('arkusz z wariantami: jedno wskazanie', drawn, 'Do wskazania', 1);
  expectCount('arkusz z wariantami: praca po błędzie rozpoznania', drawn, 'Nieoceniona', 1);
});

check('metryczki z rozpoznanymi wariantami', () => {
  const doc = makeDoc();
  const drawn = spyText(doc);
  drawStudentSlips(doc, VARIANTS, 'belfero');
  console.log(`     strony=${doc.getNumberOfPages()} plik=${save(doc, 'slips-variants.pdf')} B`);
  expectText('metryczki z wariantami', drawn, ['Klasa 3B Gimnazjum • B', 'Klasa 3B Gimnazjum • A', '13,0 / 20,0 pkt']);
  // Pasek dostaje tylko praca z wynikiem. Liczymy nagłówek sekcji powtarzany raz przy każdym pasku,
  // bo nazwiska w wąskiej kolumnie jsPDF łamie na dwa narysowane napisy i sprawdzenie po pełnym
  // nazwisku przeszłoby nawet wtedy, gdyby metryczka jednak powstała.
  expectCount('metryczki z wariantami: paski tylko z wynikiem', drawn, 'PUNKTY ZA ZADANIA', 2);
});

check('pusta sesja → błąd wstępny, nie wyjątek geometrii', () => {
  const doc = makeDoc();
  try {
    drawClassSheet(doc, { ...GROUPED, grades: [] }, 'belfero');
    throw new Error('brak prac nie zgłosił błędu');
  } catch (err) {
    const message = (err as Error).message;
    if (!message.includes('Brak prac')) throw err;
  }
});
