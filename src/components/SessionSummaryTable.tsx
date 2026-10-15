import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { LOW_CONFIDENCE_THRESHOLD } from '../utils/grading';

// ============================================
// KONTRAKT DANYCH — jedyny kształt, który widzą tabela HTML i oba generatory PDF.
// Komponent jest czysty: nie woła API, nie deszyfruje PII, niczego nie przelicza na nowo.
// ============================================

export type SessionTaskRow = {
  /** Nazwa/identyfikator zadania, np. "Zad 1" albo "Zad 3 (krótka odpowiedź)" */
  name: string;
  /** Przyznane punkty po walidacji zakresu; liczba może być ułamkowa (0.5) */
  points: number;
  /** Maksimum punktowe zadania z migawki klucza odpowiedzi; > 0 */
  maxPoints: number;
  /** true, gdy wiersz pochodzi z poprawki nauczyciela, a nie z odpowiedzi AI */
  edited: boolean;
};

export type SessionStudentGrade = {
  /** Numer ucznia z dziennika jako tekst; pusty, gdy nie ma go skąd wziąć — kreskę „—" dokładają konsumenci. */
  studentNumber: string;
  /**
   * "Imię Nazwisko" (już odszyfrowane) — brak danych = "—". W klasie numerowanej NIGDY nie nazwisko:
   * studentIdentity wstawia tam etykietę "Nr 12", więc wydruk prywatnego nauczyciela nie ma czego wyciec.
   */
  studentName: string;
  /** Ocena końcowa wyliczona poza komponentem przez calculateGrade; null = brak oceny */
  finalGrade: string | null;
  /** Suma punktów; null = praca nieoceniona */
  finalPoints: number | null;
  /** Procent 0-100 liczony poza komponentem; null gdy finalPoints === null */
  percentage: number | null;
  /** Feedback z AI: złożony z ai_response.tasks[].comment. Nigdy z sieci. */
  aiResponseFeedback: string;
  /** Nadpisuje aiResponseFeedback, gdy istnieje i jest niepusty (komentarz nauczyciela). */
  teacherResponse?: string | null;
  /** Wiersze zadań: teacher_response.tasks jeśli obecne, inaczej ai_response.tasks */
  tasks: SessionTaskRow[];
  /** true, gdy nauczyciel zatwierdził pracę (manually_verified) */
  verified: boolean;
  /** Pewność AI 0-100 do kolumny w arkuszu i stopki metryczki */
  confidenceScore: number;
  /** Tylko dla UI — klik w wiersz otwiera kartę pracy. Generatory PDF ignorują to pole. */
  gradeId?: string;
  /** Nazwa grupy w sesji grupowej; kolumna „Grupa” znika, gdy żadna praca jej nie ma */
  groupName?: string | null;
  /** Wariant rozpoznany ze skanu albo wskazany przez nauczyciela; tylko w sesji z rozpoznawaniem */
  variantName?: string | null;
  /** true, gdy wariantu tej pracy nie rozstrzygnie już żadne automatyczne sprawdzanie — czeka na kliknięcie nauczyciela */
  variantMissing?: boolean;
  /** Maksimum tej pracy. Równe data.maxPoints, dopóki grupy i warianty nie mają kluczy o różnych sumach. */
  maxPoints?: number;
};

export type SessionSummaryData = {
  sessionName: string;
  /** Pełna nazwa klasy, już odszyfrowana */
  className: string;
  /** ISO "YYYY-MM-DD" — z tego jest i nazwa pliku, i data na wydruku */
  sessionDate: string;
  /** Suma maksymalnych punktów z migawki klucza odpowiedzi; > 0 */
  maxPoints: number;
  /** Nazwa progów ocen, np. "Skala 1-6" */
  thresholdName?: string | null;
  /** Nazwy grup w kolejności z sesji — podtytuł arkusza; pusta = sesja jednym kluczem */
  groupNames?: string[];
  /** true, gdy wariant arkusza rozpoznaje AI: kolumna podziału nazywa się „Wariant”, nie „Grupa” */
  variantDetection?: boolean;
  /** Nazwy wariantów zamrożonych na sesji — podtytuł arkusza w trybie rozpoznawania */
  variantNames?: string[];
  /**
   * true, gdy klasa jest listą numerowaną (konto prywatnego nauczyciela). Żadna kolumna podziału
   * ani wydruk nie ma wtedy imienia i nazwiska, więc „Numer” i „Imię i nazwisko” scala się w „Uczeń”.
   * Znacznik płynie z `class.roster_mode`, nigdy z rozpoznawania treści wiersza.
   */
  numbered?: boolean;
  grades: SessionStudentGrade[];
};

/** Polska odmiana: 1 praca, 2–4 (poza 12–14) prace, reszta prac. */
function worksWord(count: number): string {
  if (count === 1) return 'praca';

  const lastTwo = count % 100;
  if (lastTwo >= 12 && lastTwo <= 14) return 'prac';

  const last = count % 10;
  return last >= 2 && last <= 4 ? 'prace' : 'prac';
}

// Te same stany co statusLabel w utils/sessionPdf.ts, tylko napisy wydruku są krótsze (ciasna kolumna).
// Świadomie bez wspólnego importu: sessionPdf ciągnie jspdf, a historia ma zostawać lekka.
function statusText(grade: SessionStudentGrade): string {
  if (grade.variantMissing) return 'Nie rozpoznano wariantu';
  if (grade.finalPoints === null) return 'Oczekuje na sprawdzenie';
  if (grade.verified) return 'Zweryfikowane';
  if (grade.confidenceScore < LOW_CONFIDENCE_THRESHOLD) return 'Wymaga weryfikacji';
  return 'Do weryfikacji nauczyciela';
}

function statusClasses(grade: SessionStudentGrade): string {
  if (grade.variantMissing) return 'text-amber-400';
  if (grade.finalPoints === null) return 'text-slate-400';
  if (grade.verified) return 'text-emerald-400';
  if (grade.confidenceScore < LOW_CONFIDENCE_THRESHOLD) return 'text-rose-400';
  return 'text-slate-400';
}

const points = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? '—' : value.toLocaleString('pl-PL', { maximumFractionDigits: 2 });

const percent = (value: number | null): string =>
  value === null || !Number.isFinite(value)
    ? '—'
    : `${value.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

type Props = {
  data: SessionSummaryData;
  onOpenGrade?: (gradeId: string) => void;
};

const HEAD_CELL =
  'px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap';

export default function SessionSummaryTable({ data, onOpenGrade }: Props) {
  const rowMax = (grade: SessionStudentGrade): number => grade.maxPoints ?? data.maxPoints;

  const graded = data.grades.filter((grade) => grade.finalPoints !== null);
  // Mianownik sumuje maksima poszczególnych prac: warianty A/B/C mogą mieć różną liczbę punktów,
  // więc jedna suma na całą sesję zawyżałaby średnią grupom z kluczem krótszym.
  const gradedMaxSum = graded.reduce((sum, grade) => sum + rowMax(grade), 0);
  const averagePercent = graded.length === 0 || gradedMaxSum <= 0 ? null : (graded.reduce((sum, grade) => sum + (grade.finalPoints ?? 0), 0) / gradedMaxSum) * 100;

  const hasVariants = Boolean(data.variantDetection);
  // Konto prywatnego nauczyciela: wiersz ma tylko numer, więc druga kolumna tożsamości byłaby powtórzona.
  const numbered = data.numbered === true;
  const groupNames = data.groupNames ?? [];
  const variantNames = data.variantNames ?? [];
  // Jedna kolumna podziału na sesję: wariant z rozpoznania albo grupa z przydziału — nigdy obie naraz.
  const splitLabel = (grade: SessionStudentGrade): string =>
    hasVariants ? grade.variantName ?? '' : grade.groupName ?? '';
  const hasSplit = hasVariants || data.grades.some((grade) => Boolean(grade.groupName));

  const maxByGroup = new Map<string, number>();
  for (const grade of data.grades) {
    const name = splitLabel(grade);
    if (!maxByGroup.has(name)) maxByGroup.set(name, rowMax(grade));
  }
  const maxPointsLabel =
    maxByGroup.size <= 1
      ? `maksimum ${points(data.maxPoints)} pkt`
      : `maksimum: ${[...maxByGroup.entries()]
          .map(([name, max]) => `${name || (hasVariants ? 'nierozpoznane' : 'bez grupy')} ${points(max)} pkt`)
          .join(' • ')}`;

  const splitNote =
    variantNames.length > 0
      ? ` • warianty: ${variantNames.join(', ')}`
      : groupNames.length > 0
        ? ` • grupy: ${groupNames.join(', ')}`
        : '';

  return (
    <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-800/60">
        <h2 className="text-base sm:text-lg font-bold text-slate-100">Podsumowanie sesji</h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1 tabular-nums">
          {data.className} • {data.grades.length} {worksWord(data.grades.length)} • {maxPointsLabel}
          {splitNote}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800/60">
          <thead className="bg-slate-900/50">
            <tr>
              {!numbered ? <th scope="col" className={HEAD_CELL}>Numer</th> : null}
              <th scope="col" className={HEAD_CELL}>{numbered ? 'Uczeń' : 'Imię i nazwisko'}</th>
              {hasSplit ? <th scope="col" className={HEAD_CELL}>{hasVariants ? 'Wariant' : 'Grupa'}</th> : null}
              <th scope="col" className={`${HEAD_CELL} text-right`}>Punkty</th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>%</th>
              <th scope="col" className={`${HEAD_CELL} text-center`}>Ocena</th>
              <th scope="col" className={`${HEAD_CELL} text-right`}>Pewność AI</th>
              <th scope="col" className={HEAD_CELL}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {data.grades.map((grade) => {
              const clickable = onOpenGrade !== undefined && grade.gradeId !== undefined;
              const needsVerification = grade.finalPoints !== null && grade.confidenceScore < LOW_CONFIDENCE_THRESHOLD;

              return (
                <tr
                  key={grade.gradeId ?? `${grade.studentNumber}-${grade.studentName}`}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => onOpenGrade?.(grade.gradeId as string) : undefined}
                  onKeyDown={
                    clickable
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onOpenGrade?.(grade.gradeId as string);
                          }
                        }
                      : undefined
                  }
                  aria-label={clickable ? `Otwórz pracę ucznia ${grade.studentName}` : undefined}
                  className={`transition-colors ${
                    clickable ? 'cursor-pointer ' : ''
                  }${
                    needsVerification
                      ? 'bg-rose-950/20 hover:bg-rose-950/30 border-l-4 border-rose-500'
                      : 'hover:bg-slate-800/30'
                  }`}
                >
                  {!numbered ? (
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-100 tabular-nums">
                      {grade.studentNumber || '—'}
                    </td>
                  ) : null}
                  <td
                    className={`px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-slate-100${
                      numbered ? ' tabular-nums' : ''
                    }`}
                  >
                    {grade.studentName || '—'}
                  </td>
                  {hasSplit ? (
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      {grade.variantMissing ? (
                        <span className="text-amber-400">do wskazania</span>
                      ) : (
                        splitLabel(grade) || '—'
                      )}
                    </td>
                  ) : null}
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-slate-100 tabular-nums">
                    {points(grade.finalPoints)}
                    <span className="text-slate-400"> / {points(rowMax(grade))}</span>
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-right text-slate-200 tabular-nums">
                    {percent(grade.percentage)}
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-center">
                    {grade.finalGrade ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-lg bg-blue-500/20 text-blue-300 text-sm font-semibold tabular-nums">
                        {grade.finalGrade}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {grade.finalPoints === null ? '—' : 'Brak progu dla wyniku'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-right text-slate-300 tabular-nums">
                    {grade.finalPoints === null ? '—' : `${Math.round(grade.confidenceScore)}%`}
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`inline-flex items-center gap-1.5 ${statusClasses(grade)}`}>
                      {grade.verified ? (
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      ) : needsVerification ? (
                        <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                      ) : null}
                      {statusText(grade)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-800/60 bg-slate-900/40">
              <td className="px-4 sm:px-6 py-3 text-sm font-semibold text-slate-200" colSpan={numbered ? 1 : 2}>
                Razem
              </td>
              <td className="px-4 sm:px-6 py-3 text-sm text-right text-slate-200 tabular-nums" colSpan={2}>
                {graded.length} z {data.grades.length} ocenionych • śr. {percent(averagePercent)}
              </td>
              <td className="px-4 sm:px-6 py-3 text-sm text-right text-slate-400 tabular-nums" colSpan={hasSplit ? 4 : 3}>
                Maks. {points(data.maxPoints)} pkt{data.thresholdName ? ` • skala ${data.thresholdName}` : ''}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
