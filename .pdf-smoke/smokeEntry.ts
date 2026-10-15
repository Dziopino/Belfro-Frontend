import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { jsPDF } from 'jspdf';
import { POLISH_FONT_FAMILY, assertPolishFont, loadPolishFonts, registerPolishFonts } from '../src/utils/pdfFonts';
import {
  PdfPreconditionError,
  buildPdfFileName,
  drawClassSheet,
  drawStudentSlips,
  formatPercent,
  formatPoints,
  generateClassSheet,
  generateStudentSlips,
  sortForReport,
  type PdfResult,
} from '../src/utils/sessionPdf';
import type { SessionSummaryData } from '../src/components/SessionSummaryTable';

// ============================================
// PROBA
// ============================================

const FONT_DIR = path.resolve(process.cwd(), 'public/fonts');
const OUT_DIR = path.resolve(process.cwd(), '.pdf-smoke/out');

const failures: string[] = [];
const notes: string[] = [];

function check(condition: boolean, label: string): void {
  if (condition) {
    notes.push(`OK   ${label}`);
  } else {
    failures.push(label);
    notes.push(`FAIL ${label}`);
  }
}

globalThis.fetch = (async (input: unknown) => {
  const url = String(input);
  const file = path.join(FONT_DIR, path.basename(url));
  const bytes = readFileSync(file);
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}) as unknown as typeof fetch;

type TextCall = { x: number; y: number; text: string; width: number; page: number };

function instrument(doc: jsPDF): TextCall[] {
  const calls: TextCall[] = [];
  const original = doc.text.bind(doc);

  (doc as unknown as { text: jsPDF['text'] }).text = ((
    text: string | string[],
    x: number | number[],
    y: number | number[],
    options?: unknown,
    flags?: unknown
  ) => {
    const texts = Array.isArray(text) ? text : [text];
    const xs = Array.isArray(x) ? x : [x];
    const ys = Array.isArray(y) ? y : [y];
    const page = doc.getNumberOfPages();

    texts.forEach((line, index) => {
      const px = xs[Math.min(index, xs.length - 1)];
      const py = ys[Math.min(index, ys.length - 1)];
      if (typeof px === 'number') {
        calls.push({ x: px, y: py, text: String(line), width: doc.getTextWidth(String(line)), page });
      }
    });

    return original(text, x, y, options as never, flags as never);
  }) as jsPDF['text'];

  return calls;
}

function gradeFixture(
  studentNumber: string,
  studentName: string,
  finalPoints: number | null,
  taskCount: number,
  feedback: string,
  teacherResponse: string | null
) {
  return {
    studentNumber,
    studentName,
    finalGrade: finalPoints === null ? null : finalPoints >= 30 ? '5' : finalPoints >= 18 ? '4' : '3',
    finalPoints,
    percentage: finalPoints === null ? null : (finalPoints / 50) * 100,
    aiResponseFeedback: feedback,
    teacherResponse,
    tasks: Array.from({ length: taskCount }, (_, index) => ({
      name: `Zad ${index + 1}`,
      points: index % 3 === 0 ? 0.5 : (index % 4) + 1,
      maxPoints: 4,
      edited: index === 0,
    })),
    verified: finalPoints !== null && studentNumber === '12',
    confidenceScore: finalPoints === null ? 0 : 55 + (Number(studentNumber) % 40),
  };
}

const LONG_FEEDBACK =
  'Zadanie 1: poprawnie wskazano przyczynę, ale zabrakło odniesienia do kontekstu historycznego — pamiętaj, że ocena ' +
  'krótka wymaga też przykładu. Zadanie 2: błędna data, przez co rozumowanie straciło podstawę faktyczną. Zadanie 3: ' +
  'praca bardzo dobra, widać samodzielne myślenie i staranne uporządkowanie argumentów; rozwień jeszcze wniosek, żeby ' +
  'zamknąć wywód klamrą. Zadanie 4: niepełna odpowiedź — pominąłeś drugi człon porównania, a to połowa punktów. '.repeat(3);

const fixture: SessionSummaryData = {
  sessionName: 'Sprawdzian „Epoka rozbicia” — kl. 7B/2',
  className: '7B (SP3 Gorzów)',
  sessionDate: '2026-10-11',
  maxPoints: 50,
  thresholdName: 'Skala 1-6',
  numbered: false,
  grades: [
    gradeFixture('3', 'Żaneta Wąż-Gębal', 47.5, 9, LONG_FEEDBACK, 'Bardzo dobra praca, gratuluję konsekwencji.'),
    gradeFixture('10', 'Grzegorz Brzęczyszczykiewicz', 22, 14, LONG_FEEDBACK, null),
    gradeFixture('4', 'Łucja Óławska-Ślączynka', null, 0, '', null),
    gradeFixture('21', 'Miłosz Dziedzic', 8, 24, LONG_FEEDBACK.repeat(6), null),
    gradeFixture('7', 'Rafał Żółć', 33, 6, 'Zad 1: OK\nZad 2: brak jednostek', null),
    gradeFixture('12', 'Anna Nowak', 41, 5, 'Zad 1: OK', 'Zatwierdzone przeze mnie bez zmian.'),
    gradeFixture('1', 'Bożena Cebula', 15.5, 7, LONG_FEEDBACK, null),
    gradeFixture('2', 'Ćmiciecki Źbik', null, 0, '', null),
    gradeFixture('100', 'Ksawery Szmidt', 50, 3, 'Wszystko poprawnie.', null),
  ],
};

/** Konto prywatnego nauczyciela: studentIdentity wstawia etykietę w pole nazwiska, więc tu robimy to samo. */
const numberedFixture: SessionSummaryData = {
  ...fixture,
  // Inna nazwa sesji niż w arkuszu z nazwiskami — obie pary PDF-ów zapisują się do tego samego katalogu,
  // a nazwa pliku liczy się wyłącznie z nazwy sesji i daty.
  sessionName: 'Kartkówka numerowana',
  className: 'Korepetycje 2027',
  numbered: true,
  grades: fixture.grades.map((grade) => ({ ...grade, studentName: `Nr ${grade.studentNumber}` })),
};

/** Scalona kolumna plus kolumna podziału — czwarty zestaw szerokości, najłatwiej go przeoczyć. */
const numberedGroupedFixture: SessionSummaryData = {
  ...numberedFixture,
  groupNames: ['A', 'B'],
  grades: numberedFixture.grades.map((grade, index) => ({ ...grade, groupName: index % 2 === 0 ? 'A' : 'B' })),
};

const fixtureNames = fixture.grades.map((grade) => grade.studentName);

function newDoc(): jsPDF {
  return new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
}

function report(calls: TextCall[], label: string, minTextX: number): void {
  const offenders = calls.filter((call) => call.x < minTextX);
  const overflow = calls.filter((call) => call.x + call.width > 196.001);
  const below = calls.filter((call) => call.y > 297 || call.y < 0);

  check(offenders.length === 0, `${label}: żadna linia tekstu nie schodzi poniżej x=${minTextX} mm`);
  check(overflow.length === 0, `${label}: żadna linia nie przekracza prawego marginesu 196 mm`);
  check(below.length === 0, `${label}: cały tekst mieści się w pionie strony`);

  if (offenders.length > 0) {
    notes.push(`  pierwsze wykroczenie w guttrze: x=${offenders[0].x.toFixed(2)}`);
  }
  if (overflow.length > 0) {
    notes.push(`  przepełnienie w poziomie: x=${overflow[0].x.toFixed(2)} sz=${overflow[0].width.toFixed(2)}`);
  }

  notes.push(`  (${label}: ${calls.length} wywołań tekstu)`);
}

const minText = 15;
const DEV_IN_BUNDLE = import.meta.env.DEV;

// ============================================
// RUN
// ============================================

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  notes.push(`  DEV w bundlu: ${String(DEV_IN_BUNDLE)} (asercje geometryczne ${DEV_IN_BUNDLE ? 'aktywne' : 'wyłączone — ścieżka produkcyjna'})`);

  // --- font: rund-trip z dysku i rejestracja
  const fonts = await loadPolishFonts();
  check(fonts.length === 2, 'fonty wczytane w dwóch stylach');

  const rawNormal = readFileSync(path.join(FONT_DIR, 'DejaVuSans.ttf'));
  const decoded = Buffer.from(fonts[0].base64, 'base64');
  check(
    createHash('sha256').update(decoded).digest('hex') === createHash('sha256').update(rawNormal).digest('hex'),
    'base64 odczytany z TTF odwraca się w identyczne bajki pliku'
  );

  const probe = newDoc();
  const family = registerPolishFonts(probe, fonts);
  check(family === POLISH_FONT_FAMILY, 'rodzina fontu zwrócona to „belfero”');
  assertPolishFont(probe, family);
  probe.setFont(family, 'bold');
  check(true, 'assertPolishFont przepuszcza zarejestrowaną rodzinę (normal + bold)');

  const beforeBytes = decoded.length;
  check(beforeBytes > 700_000, `DejaVuSans.ttf ma ${beforeBytes} B — pełny krój, bez subsettingu`);

  // --- arkusz zbiorczy: geometria + treść
  const sheetDoc = newDoc();
  const sheetFont = registerPolishFonts(sheetDoc, fonts);
  const sheetCalls = instrument(sheetDoc);
  drawClassSheet(sheetDoc, fixture, sheetFont);

  report(sheetCalls, 'arkusz zbiorczy', 14);
  const sheetPages = sheetDoc.getNumberOfPages();
  check(sheetPages >= 1, `arkusz: ${sheetPages} stron(y)`);

  const ungradedNumbers = new Set(
    fixture.grades.filter((grade) => grade.finalPoints === null).map((grade) => grade.studentNumber)
  );
  // Nazwisko 40,4 mm nie mieści się w 39 mm czystego tekstu kolumny, więc autoTable łamie je na dwa
  // fragmenty — szukamy pierwszego, nie całego stringa.
  const ungradedRow = sheetCalls.find((call) => call.text.startsWith('Łucja'));
  check(ungradedRow !== undefined, 'arkusz: nieoceniona uczennica jest w tabeli');
  check(ungradedNumbers.size === 2, 'arkusz: dwie prace bez punktów w fixture');
  check(
    sheetCalls.some((call) => call.text === 'Nieoceniona'),
    'arkusz: status „Nieoceniona” wydrukowany dla prac bez punktów'
  );
  check(
    sheetCalls.some((call) => call.text === '—'),
    'arkusz: kolumny liczbowe nieocenionej pracy pokazują „—”, nie 0 ani null'
  );
  check(
    sheetCalls.some((call) => call.text.startsWith('Razem')),
    'arkusz: wiersz podsumowania na końcu tabeli'
  );
  check(
    sheetCalls.some((call) => /^[0-9]+,[0-9]+$/.test(call.text)),
    'arkusz: liczby dziesiętne z przecinkiem (format PL)'
  );

  // kolejność dziennikowa zamiast kolejności pewności AI
  const ordered = sortForReport(fixture.grades).map((grade) => grade.studentNumber);
  check(
    JSON.stringify(ordered) === JSON.stringify(['1', '2', '3', '4', '7', '10', '12', '21', '100']),
    `sortowanie naturalne po numerze: ${ordered.join(',')}`
  );

  // --- metryczki: geometria, guttr, łamanie pasków
  const slipDoc = newDoc();
  const slipFont = registerPolishFonts(slipDoc, fonts);
  const slipCalls = instrument(slipDoc);
  drawStudentSlips(slipDoc, fixture, slipFont);

  report(slipCalls, 'metryczki', minText);
  check(slipCalls.every((call) => call.x >= 15), 'metryczki: bezwzględny warunek x >= 15 mm dla każdej linii');
  check(!slipCalls.some((call) => call.text.includes('Óławska')), 'metryczki: nieoceniona praca nie ma swojego paska');

  const gradedCount = fixture.grades.filter((grade) => grade.finalPoints !== null).length;
  const slipPages = slipDoc.getNumberOfPages();
  const expectedPages = Math.ceil(gradedCount / 3);
  check(slipPages === expectedPages, `metryczki: ${slipPages} stron dla ${gradedCount} prac (oczekiwano ceil(n/3)=${expectedPages})`);
  check(slipCalls.filter((call) => call.text === 'SESJA').length === gradedCount, 'metryczki: dokładnie jedna metryczka na ocenioną pracę');

  const feedbackLines = slipCalls.filter((call) => call.x >= 120 && call.x < 125 && call.text !== 'INFORMACJA ZWROTNA');
  const slipBands = new Map<string, TextCall[]>();
  for (const call of feedbackLines) {
    const key = `${call.page}:${Math.floor(call.y / 99)}`;
    slipBands.set(key, [...(slipBands.get(key) ?? []), call]);
  }

  check(feedbackLines.length > 0, `metryczki: sekcja „Informacja zwrotna” narysowana (${feedbackLines.length} linii w ${slipBands.size} metryczkach)`);
  check(slipBands.size === gradedCount, 'metryczki: każda oceniona praca ma swój blok feedbacku');
  check(
    [...slipBands.values()].every((band) => band.length <= 24),
    `metryczki: żaden feedback nie przekracza limitu 24 linii (max w teście: ${Math.max(...[...slipBands.values()].map((band) => band.length))})`
  );

  const capped = [...slipBands.values()].find((band) => band.length === 24);
  check(capped !== undefined, 'metryczki: bardzo długi feedback docięty dokładnie do limitu sekcji');
  check(capped !== undefined && capped[capped.length - 1].text.endsWith('…'), 'metryczki: przycięty feedback kończy się wielokropkiem');

  const truncated = slipCalls.filter((call) => call.text.startsWith('… (+'));
  check(truncated.length > 0, `metryczki: minitabela zadań przycięta z „${truncated[0]?.text ?? '—'}”`);

  const stripFooter = slipCalls.filter(
    (call) => call.text.includes('Belfero.pl') || /pasek \d/.test(call.text) || call.text.includes('Pewność AI')
  );
  check(stripFooter.length === 0, `metryczki: pasek nie ma żadnej stopki (znaleziono ${stripFooter.length} linii)`);
  check(sheetCalls.some((call) => call.text.includes('Belfero.pl')), 'arkusz: stopka „Wygenerowano w Belfero.pl” zostaje bez zmian');

  // --- tryb numerowany: jedna kolumna tożsamości i zero nazwisk na papierze
  const namedLeaks = sheetCalls.filter((call) => fixtureNames.some((name) => call.text.includes(name)));
  check(namedLeaks.length > 0, `arkusz z nazwiskami: filtr wycieku coś faktycznie łapie (${namedLeaks.length} linii)`);

  const numberedSheetDoc = newDoc();
  const numberedSheetCalls = instrument(numberedSheetDoc);
  drawClassSheet(numberedSheetDoc, numberedFixture, registerPolishFonts(numberedSheetDoc, fonts));
  report(numberedSheetCalls, 'arkusz numerowany', 14);

  check(numberedSheetCalls.some((call) => call.text === 'Uczeń'), 'arkusz numerowany: nagłówek scalonej kolumny „Uczeń”');
  check(!numberedSheetCalls.some((call) => call.text === 'Numer'), 'arkusz numerowany: kolumna „Numer” zniknęła');
  check(!numberedSheetCalls.some((call) => call.text === 'Imię i nazwisko'), 'arkusz numerowany: kolumna nazwiska zniknęła');
  check(numberedSheetCalls.some((call) => call.text === 'Nr 100'), 'arkusz numerowany: etykieta „Nr 100” wydrukowana');
  check(numberedSheetCalls.some((call) => call.text.startsWith('Razem')), 'arkusz numerowany: stopka bez dryfu kolumn');
  const numberedSheetLeaks = numberedSheetCalls.filter((call) => fixtureNames.some((name) => call.text.includes(name)));
  check(
    numberedSheetLeaks.length === 0,
    `arkusz numerowany: żadne nazwisko nie wyszło na wydruk (znaleziono: ${numberedSheetLeaks.map((call) => call.text).join(' | ') || 'nic'})`
  );

  const numberedGroupedDoc = newDoc();
  const numberedGroupedCalls = instrument(numberedGroupedDoc);
  drawClassSheet(numberedGroupedDoc, numberedGroupedFixture, registerPolishFonts(numberedGroupedDoc, fonts));
  report(numberedGroupedCalls, 'arkusz numerowany z grupami', 14);
  check(
    numberedGroupedCalls.some((call) => call.text === 'Uczeń') && numberedGroupedCalls.some((call) => call.text === 'Grupa'),
    'arkusz numerowany z grupami: scalenie trzyma się razem z kolumną podziału'
  );
  check(
    numberedGroupedCalls.filter((call) => fixtureNames.some((name) => call.text.includes(name))).length === 0,
    'arkusz numerowany z grupami: zero nazwisk przy czterech kolumnach tożsamości'
  );

  const numberedSlipDoc = newDoc();
  const numberedSlipCalls = instrument(numberedSlipDoc);
  drawStudentSlips(numberedSlipDoc, numberedFixture, registerPolishFonts(numberedSlipDoc, fonts));
  report(numberedSlipCalls, 'metryczki numerowane', minText);
  check(numberedSlipCalls.every((call) => call.x >= 15), 'metryczki numerowane: pas na zszywki nadal pusty');
  check(!numberedSlipCalls.some((call) => call.text.startsWith('Numer:')), 'metryczki numerowane: linia „Numer:” nie dubluje etykiety');
  const slipLabels = numberedSlipCalls.filter((call) => /^Nr [0-9]+$/.test(call.text));
  check(slipLabels.length === gradedCount, `metryczki numerowane: ${slipLabels.length} etykiet na ${gradedCount} pasków`);
  check(
    numberedSlipCalls.filter((call) => fixtureNames.some((name) => call.text.includes(name))).length === 0,
    'metryczki numerowane: żadne nazwisko nie trafiło na pasek'
  );

  // --- ścieżka produkcyjna (blob + nazwa pliku)
  const sheetPdf: PdfResult = await generateClassSheet(fixture);
  const slipPdf: PdfResult = await generateStudentSlips(fixture);
  const numberedSheetPdf: PdfResult = await generateClassSheet(numberedGroupedFixture);
  const numberedSlipPdf: PdfResult = await generateStudentSlips(numberedFixture);

  for (const result of [sheetPdf, slipPdf, numberedSheetPdf, numberedSlipPdf]) {
    const bytes = Buffer.from(await result.blob.arrayBuffer());
    writeFileSync(path.join(OUT_DIR, result.fileName), bytes);
    notes.push(`  zapisano ${result.fileName} — ${(bytes.length / 1024).toFixed(0)} kB, ${result.pageCount} stron`);
    check(bytes.length > 50_000, `${result.fileName}: PDF ma treść (${(bytes.length / 1024).toFixed(0)} kB)`);
    check(bytes.subarray(0, 5).toString('latin1') === '%PDF-', `${result.fileName}: nagłówek %PDF-`);
    check(bytes.includes(Buffer.from('ToUnicode')), `${result.fileName}: jest mapa ToUnicode (polskie znaki kopiowalne z wydruku)`);
    check(bytes.includes(Buffer.from('DejaVu')), `${result.fileName}: font DejaVu osadzony w pliku`);
  }

  check(sheetPdf.fileName === 'belfero-arkusz-zbiorczy-Sprawdzian-„Epoka-rozbicia”-—-kl.-7B2-2026-10-11.pdf', `nazwa pliku arkusza: ${sheetPdf.fileName}`);
  check(slipPdf.fileName.startsWith('belfero-metryczki-'), `nazwa pliku metryczek: ${slipPdf.fileName}`);
  check(
    buildPdfFileName('metryczki', '  Very Long Name With Spaces And Polish łąśżź ąę '.repeat(4), '2026-10-11').length <= 130,
    'nazwa pliku przydługa jest skracana'
  );
  check(
    !/[<>:"/\\|?*]/.test(buildPdfFileName('metryczki', 'A<B>C:D/E\\F|G?H*I"', '2026-10-11')),
    'nazwa pliku bez znaków zakazanych na Windows'
  );
  check(formatPoints(47.5) === '47,5' && formatPercent(94.55) === '94,6%', `formatowanie PL: ${formatPoints(47.5)} / ${formatPercent(94.55)}`);

  // --- błędy biznesowe zamiast surowego wyjątku
  const empty: SessionSummaryData = { ...fixture, grades: [] };
  await generateClassSheet(empty).then(
    () => check(false, 'arkusz bez prac powinien rzucać PdfPreconditionError'),
    (err) => check(err instanceof PdfPreconditionError && err.code === 'NO_GRADES', 'arkusz bez prac → NO_GRADES')
  );

  const noSlips: SessionSummaryData = { ...fixture, grades: fixture.grades.map((g) => ({ ...g, finalPoints: null, percentage: null, finalGrade: null })) };
  await generateStudentSlips(noSlips).then(
    () => check(false, 'metryczki bez ocenionych prac powinny rzucać PdfPreconditionError'),
    (err) => check(err instanceof PdfPreconditionError && err.code === 'NO_SLIPS', 'metryczki bez ocenionych prac → NO_SLIPS')
  );

  // --- font nierejestrowany nie może drukować na Helvetica
  try {
    drawClassSheet(new jsPDF({ unit: 'mm', format: 'a4' }), fixture, 'belfero');
    check(false, 'bez rejestracji fontu generowanie musi zostać zablokowane');
  } catch (err) {
    check(err instanceof Error && err.message === 'FONT_LOAD_FAILED', 'brak fontu w dokumencie → FONT_LOAD_FAILED (bez Helvetica)');
  }

  console.log(notes.join('\n'));
  console.log(`\nWYNIK: ${failures.length === 0 ? 'WSZYSTKIE ASPERCJE PRZESZŁY' : `${failures.length} BLĘDÓW`}`);
  if (failures.length > 0) {
    console.log(failures.map((f) => ` - ${f}`).join('\n'));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('SMOKE CRASH:', err);
  process.exitCode = 2;
});
