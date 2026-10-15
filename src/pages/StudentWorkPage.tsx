import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL, gradingAPI } from '../services/apiService';
import { decryptData } from '../services/cryptoService';
import { studentIdentity } from '../utils/studentIdentity';
import {
  answerKeyForGrade,
  calculateGrade,
  certaintyLabel,
  hasVariantDetection,
  maxPointsForGrade,
  resolveEffectiveTasks,
  sessionTitle,
  variantLabelForGrade,
  variantMissingForGrade,
  LOW_CONFIDENCE_THRESHOLD,
} from '../utils/grading';
import type { Grade, GradingSession, TaskCertainty } from '../types';
import Sidebar from '../components/Sidebar';
import HeaderAccount from '../components/HeaderAccount';
import VariantPicker from '../components/VariantPicker';
import { AlertTriangle, ArrowLeft, Bell, CheckCircle2, Save, ImageIcon } from 'lucide-react';
import { apiErrorMessage } from '../utils/apiError';

type EditSubRow = {
  /** Litera podpunktu z klucza tej pracy („a", „b"). Serwer dopasowuje ją bez różnicy wielkości. */
  id: string;
  max_points: number;
  points: number;
  /** Co model odczytał przy tym podpunkcie. Puste po poprawce nauczyciela. */
  transcription: string;
  certainty: TaskCertainty | null;
  confidence: number | null;
};

type EditRow = {
  task_number: number;
  max_points: number;
  points: number;
  comment: string;
  edited: boolean;
  gradedByAi: boolean;
  /** Etykieta z odpowiedzi AI; null dla prac sprzed rozpoznawania i dla wierszy po poprawce. */
  certainty: TaskCertainty | null;
  /** 0-100 wyliczone w backendzie z tej etykiety. */
  confidence: number | null;
  /** Co AI twierdzi, że przeczytało w tym zadaniu. */
  transcription: string;
  /** Pusta = zadanie oceniane jedną liczbą punktów. */
  sub_items: EditSubRow[];
};

// Ta sama zasada co w backendzie: identyfikator klucza, którego nie da się przeczytać
// jako liczby, schodzi do pozycji na liście — dzięki temu liczba w PATCH jest rozpoznawalna.
function toTaskNumber(taskId: number | string, index: number): number {
  const asNumber = Number(taskId);
  return Number.isInteger(asNumber) ? asNumber : index + 1;
}

function subId(id: unknown): string {
  return typeof id === 'string' ? id.trim().toLocaleLowerCase() : typeof id === 'number' ? String(id) : '';
}

/**
 * Suma podpunktów = punkty zadania. Zaokrąglamy do dwóch miejsc, bo stawki po 0,5 i 0,25
 * zbierają się w binarny szum (`0.1 + 0.1 + 0.1`), a ta liczba idzie do dziennika.
 */
function sumSubPoints(subs: EditSubRow[]): number {
  return Math.round(subs.reduce((sum, sub) => sum + sub.points, 0) * 100) / 100;
}

export default function StudentWorkPage() {
  const { sessionId, gradeId } = useParams<{ sessionId: string; gradeId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<GradingSession | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [studentName, setStudentName] = useState('—');
  const [studentNumber, setStudentNumber] = useState('');
  const [className, setClassName] = useState('—');
  const [rows, setRows] = useState<EditRow[]>([]);
  const [notes, setNotes] = useState('');
  const [markVerified, setMarkVerified] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    if (!sessionId || !gradeId) return;
    loadWork(sessionId, gradeId);
  }, [sessionId, gradeId]);

  const loadWork = async (sid: string, gid: string) => {
    try {
      setIsLoading(true);
      setError('');
      setImageFailed(false);

      const { session: fetched } = await gradingAPI.getSession(sid);
      const found = fetched.grades?.find((item) => item.id === gid) ?? null;

      setSession(fetched);
      setGrade(found);

      if (fetched.class?.encrypted_name) {
        try {
          setClassName((await decryptData(fetched.class.encrypted_name)) || '—');
        } catch (err) {
          console.error(`Nie udało się odszyfrować nazwy klasy ${fetched.class_id}:`, err);
          setClassName('—');
        }
      }

      if (!found) {
        setError('Nie znaleziono tej pracy w sesji');
        return;
      }

      if (found.student) {
        const identity = await studentIdentity(found.student);
        setStudentName(identity.label);
        // W klasie numerowanej numer jest już w etykiecie — „Nr 12 · nr 12" nie mówi nic więcej.
        setStudentNumber(identity.numbered ? '' : identity.number);
      }

      // Klucz tej pracy: wariant z rozpoznania, inaczej grupa z przydziału, inaczej klucz sesji.
      // Bez rozstrzygniętego wariantu praca nie ma własnej skali — nie budujemy wierszy na kluczu
      // wariantu 0, bo punkty wpisane przeciw obcemu maksimum trafiłyby prosto do dziennika.
      const keyTasks = variantMissingForGrade(fetched, found)
        ? []
        : answerKeyForGrade(fetched, found)?.tasks ?? [];
      const effective = resolveEffectiveTasks(found);
      const tasksByNumber = new Map(effective.tasks.map((task) => [task.task_number, task]));

      setRows(
        keyTasks.map((task, index) => {
          const number = toTaskNumber(task.id, index);
          const match = tasksByNumber.get(number);
          const subsById = new Map((match?.sub_items ?? []).map((sub) => [subId(sub.id), sub]));

          // Listę podpunktów definiuje klucz tej pracy, nie model: podpunkt, którego AI nie
          // zwróciło, zostaje z zerem i własną stawką, więc nauczyciel widzi, czego brakuje.
          // Wiersze pokazujemy dopiero gdy wynik pracy naprawdę je niesie — zbiorczej poprawki ani
          // odpowiedzi bez rozbienia nie naprawiamy zerami, bo to gotowy punkt ucznia.
          const breakdownMissing = match !== undefined && match.sub_items.length === 0;
          const subItems: EditSubRow[] = breakdownMissing
            ? []
            : (task.sub_items ?? []).map((sub) => {
                const source = subsById.get(subId(sub.id));

                return {
                  id: sub.id,
                  max_points: sub.max_points,
                  points: source?.points ?? 0,
                  transcription: source?.transcription ?? '',
                  certainty: source?.certainty ?? null,
                  confidence: source?.confidence ?? null,
                };
              });

          return {
            task_number: number,
            max_points: task.max_points,
            points: subItems.length > 0 ? sumSubPoints(subItems) : match?.points ?? 0,
            comment: match?.comment ?? '',
            edited: match?.edited ?? false,
            gradedByAi: match !== undefined && effective.source === 'ai',
            certainty: match?.certainty ?? null,
            confidence: match?.confidence ?? null,
            transcription: match?.transcription ?? '',
            sub_items: subItems,
          };
        })
      );

      setNotes(found.teacher_notes ?? '');
      setMarkVerified(false);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się załadować pracy ucznia'));
    } finally {
      setIsLoading(false);
    }
  };

  const updateRow = (taskNumber: number, patch: Partial<EditRow>) => {
    setSavedMessage('');
    setRows((previous) => previous.map((row) => (row.task_number === taskNumber ? { ...row, ...patch } : row)));
  };

  /**
   * Zadanie z podpunktami nie ma własnego pola na punkty: jest nim suma wierszy. Przeliczamy ją
   * przy każdej zmianie, żeby licznik u góry i to, co wyślemy, nigdy się nie rozjechały.
   */
  const updateSubPoint = (taskNumber: number, subIdent: string, points: number) => {
    setSavedMessage('');
    setRows((previous) =>
      previous.map((row) => {
        if (row.task_number !== taskNumber) return row;
        const subItems = row.sub_items.map((sub) => (sub.id === subIdent ? { ...sub, points } : sub));
        return { ...row, sub_items: subItems, points: sumSubPoints(subItems) };
      })
    );
  };

  const detectsVariants = hasVariantDetection(session);
  const variantPending = grade !== null && variantMissingForGrade(session, grade);
  const totalPoints = variantPending ? 0 : maxPointsForGrade(session, grade);
  const workLabel = variantLabelForGrade(session, grade);
  const liveTotal = useMemo(() => Number(rows.reduce((sum, row) => sum + row.points, 0).toFixed(2)), [rows]);
  const calculatedGrade = calculateGrade(rows.length > 0 ? liveTotal : null, totalPoints, session?.grade_threshold?.thresholds ?? null);

  const imageSrc = grade?.image_path
    ? `${API_BASE_URL.replace(/\/api\/?$/, '')}/${grade.image_path}`
    : '';

  const handleSave = async () => {
    if (!sessionId || !grade) return;
    setError('');
    setSavedMessage('');

    for (const row of rows) {
      if (row.sub_items.length > 0) {
        for (const sub of row.sub_items) {
          if (!Number.isFinite(sub.points) || sub.points < 0 || sub.points > sub.max_points) {
            setError(
              `Zadanie ${row.task_number}, podpunkt ${sub.id}: punkty muszą być z zakresu 0 do ${sub.max_points}`
            );
            return;
          }
        }
        continue;
      }

      if (!Number.isFinite(row.points) || row.points < 0 || row.points > row.max_points) {
        setError(`Zadanie ${row.task_number}: punkty muszą być z zakresu 0 do ${row.max_points}`);
        return;
      }
    }

    try {
      setIsSaving(true);

      await gradingAPI.updateGrade(sessionId, grade.id, {
        tasks: rows.map((row) =>
          row.sub_items.length > 0
            ? {
                task_number: row.task_number,
                comment: row.comment,
                // Bez `points`: przy podpunktach sumę wystawia serwer z tych wierszy, a liczba
                // z żądania byłaby drugą, mogącą się rozjechać wersją tego samego wyniku.
                sub_items: row.sub_items.map((sub) => ({ id: sub.id, points: sub.points })),
              }
            : { task_number: row.task_number, points: row.points, comment: row.comment }
        ),
        teacher_notes: notes.trim() || null,
        ...(markVerified ? { mark_verified: true } : {}),
      });

      await loadWork(sessionId, grade.id);
      setSavedMessage('Poprawki zostały zapisane');
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się zapisać poprawek'));
    } finally {
      setIsSaving(false);
    }
  };

  const isVerified = grade?.manually_verified === true || markVerified;
  const aiNotGraded = grade !== null && grade.final_points === null;
  const lowConfidence = grade !== null && !aiNotGraded && grade.confidence_score < LOW_CONFIDENCE_THRESHOLD;

  // Zadania, przy których sam model zaznaczył, że nie jest pewny. Bez tego panel mówił nauczycielowi
  // tylko „coś jest nie tak", a nie gdzie patrzeć.
  const shakyRows = rows.filter((row) => row.certainty !== null && row.certainty !== 'certain');
  const shakyList = (() => {
    const shown = shakyRows.slice(0, 5).map((row) => {
      const label = certaintyLabel(row.certainty) ?? 'niepewne';
      return typeof row.confidence === 'number' ? `Zad ${row.task_number} — ${label} (${row.confidence}%)` : `Zad ${row.task_number} — ${label}`;
    });
    if (shown.length === 0) return '';
    const hidden = shakyRows.length - shown.length;
    return `${shown.join(', ')}${hidden > 0 ? `, i jeszcze ${hidden}` : ''}`;
  })();

  return (
    <div className="flex min-h-screen bg-[#0B0F19]">
      <Sidebar />

      <div className="flex-1 w-full min-w-0 lg:ml-64">
        {/* Header */}
        <header className="h-14 sm:h-16 bg-[#131B2E] border-b border-slate-800/60 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-10">
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            {/* Mobile: rezerwujemy miejsce na hamburger, który jest fixed top-3 left-4 */}
            <div className="lg:hidden w-12 shrink-0"></div>

            <button
              onClick={() => navigate(`/history/${sessionId}`)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium rounded-xl transition-colors text-xs whitespace-nowrap cursor-pointer min-h-11"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Powrót
            </button>

            <div className="border-l border-slate-800/60 pl-2 sm:pl-4 min-w-0">
              <h1 className="text-sm sm:text-lg font-bold text-slate-100 truncate">
                {studentName}
                {studentNumber ? <span className="text-slate-400"> · nr {studentNumber}</span> : null}
              </h1>
              {session && (
                <p className="text-xs text-slate-400 truncate">
                  {sessionTitle(session, className)} • Klasa {className}
                  {workLabel ? ` • ${workLabel}` : ''}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 ml-auto shrink-0">
            <button
              className="hidden sm:inline-flex p-2 rounded-xl hover:bg-slate-800/50 transition-colors cursor-pointer min-h-11 min-w-11 items-center justify-center"
              title="Powiadomienia"
              aria-label="Powiadomienia"
            >
              <Bell className="w-5 h-5 text-slate-400" aria-hidden="true" />
            </button>
            <HeaderAccount />
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 mx-auto w-full max-w-7xl">
          {/* Loading */}
          {isLoading && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start" aria-busy="true">
              <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5 animate-pulse motion-reduce:animate-none">
                <div className="h-5 w-28 rounded bg-slate-800 mb-4" />
                <div className="h-64 sm:h-96 rounded-xl bg-slate-800/50" />
              </div>

              <div className="space-y-4 sm:space-y-6">
                <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5 animate-pulse motion-reduce:animate-none">
                  <div className="h-5 w-40 rounded bg-slate-800 mb-4" />
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="bg-slate-900/50 border border-slate-800/60 rounded-xl p-4 space-y-3">
                        <div className="h-4 w-24 rounded bg-slate-800" />
                        <div className="h-10 w-24 rounded-xl bg-slate-800/50" />
                        <div className="h-14 w-full rounded-xl bg-slate-800/50" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5 h-32 animate-pulse motion-reduce:animate-none" />
              </div>
              <p className="sr-only">Ładowanie pracy ucznia</p>
            </div>
          )}

          {error && (
            <div className="p-3 sm:p-4 bg-rose-950/40 border border-rose-800/50 rounded-xl" role="alert">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}

          {!isLoading && grade && (
            <>
              {aiNotGraded && !variantPending && (
                <div className="p-3 sm:p-4 bg-blue-950/40 border border-blue-800/50 rounded-xl" role="status">
                  <p className="text-sm text-blue-300">
                    Ta praca nie została jeszcze sprawdzona przez AI. Możesz ocenić ją ręcznie i zapisać punkty.
                  </p>
                </div>
              )}

              {!aiNotGraded && lowConfidence && (
                <div
                  className="p-3 sm:p-4 bg-rose-950/40 border border-rose-800/50 rounded-xl"
                  role="status"
                >
                  <p className="text-sm text-rose-300 flex items-start gap-2 tabular-nums">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    {shakyList ? (
                      <span>
                        Pewność tej oceny to {grade.confidence_score}%, bo AI nie był pewny swoich odczytów
                        w tych zadaniach: {shakyList}. Zajrzyj w nie i popraw punkty, jeśli się z nimi nie
                        zgadzasz.
                      </span>
                    ) : (
                      <span>
                        AI ma {grade.confidence_score}% pewności tej oceny. Sprawdź odpowiedzi i
                        ewentualnie popraw punkty.
                      </span>
                    )}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
                {/* Scan */}
                <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5">
                  <h2 className="text-base sm:text-lg font-bold text-slate-100 mb-3">Skan pracy</h2>

                  {imageSrc && !imageFailed ? (
                    <div className="overflow-auto rounded-xl bg-slate-900/40 border border-slate-800/60 max-h-[70vh]">
                      <img
                        src={imageSrc}
                        alt="Skan pracy ucznia"
                        loading="lazy"
                        decoding="async"
                        onError={() => setImageFailed(true)}
                        className="w-full h-auto"
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 py-12 px-4 text-center">
                      <ImageIcon className="w-8 h-8 text-slate-400 mx-auto mb-3" aria-hidden="true" />
                      <p className="text-sm text-slate-300">Skan niedostępny</p>
                      <p className="text-xs text-slate-400 mt-2">
                        Nie udało się wczytać obrazu pracy z serwera
                      </p>
                    </div>
                  )}
                </div>

                {/* Tasks */}
                <div className="space-y-4 sm:space-y-6">
                  {detectsVariants && session && sessionId && (
                    <VariantPicker
                      sessionId={sessionId}
                      session={session}
                      grade={grade}
                      onRegraded={() => loadWork(sessionId, grade.id)}
                    />
                  )}

                  <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <h2 className="text-base sm:text-lg font-bold text-slate-100">Punkty za zadania</h2>
                      {!aiNotGraded && (
                        <span
                          className="shrink-0 text-xs text-slate-400 cursor-help"
                          title="Liczba wyliczona z etykiet pewności poszczególnych zadań, ważona ich maksymalną punktacją. Model nie podaje swojej pewności wprost."
                        >
                          Pewność AI:{' '}
                          <span className="font-semibold text-slate-200 tabular-nums">{grade.confidence_score}%</span>
                        </span>
                      )}
                    </div>

                    {rows.length === 0 ? (
                      <p className="text-sm text-slate-400">
                        {variantPending
                          ? 'Wskaż wariant tej pracy, żeby pojawiły się zadania z jego klucza odpowiedzi.'
                          : 'Ta sesja nie ma klucza odpowiedzi, więc nie można przydzielić punktów.'}
                      </p>
                    ) : (
                      <div className="space-y-3 sm:space-y-4">
                        {rows.map((row) => (
                          <div
                            key={row.task_number}
                            className="bg-slate-900/50 border border-slate-800/60 rounded-xl p-4"
                          >
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <h3 className="text-sm sm:text-base font-semibold text-slate-100">
                                Zadanie {row.task_number}
                              </h3>
                              <span className="inline-flex items-center gap-1.5 shrink-0">
                                {row.certainty && row.certainty !== 'certain' && (
                                  <span
                                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap bg-amber-950/40 text-amber-400 border-amber-800/50"
                                    title={
                                      row.sub_items.length > 0
                                        ? 'Etykieta najgorszego z podpunktów, a liczba to pewność ważona ich punktacją.'
                                        : typeof row.confidence === 'number'
                                          ? `Pewność tego zadania: ${row.confidence}%. Ciągnie pewność całej pracy w dół.`
                                          : undefined
                                    }
                                  >
                                    {certaintyLabel(row.certainty)}
                                    {typeof row.confidence === 'number' ? ` · ${row.confidence}%` : ''}
                                  </span>
                                )}
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${
                                    row.edited
                                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
                                      : 'bg-blue-950/40 text-blue-400 border-blue-800/50'
                                  }`}
                                >
                                  {row.edited ? (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                      Poprawione
                                    </>
                                  ) : (
                                    'AI'
                                  )}
                                </span>
                              </span>
                            </div>

                            {row.sub_items.length > 0 ? (
                              <div className="mb-3">
                                <p className="text-xs font-medium text-slate-400 mb-2">
                                  Podpunkty — punkty zadania to ich suma
                                </p>
                                <div className="space-y-2.5">
                                  {row.sub_items.map((sub) => (
                                    <div key={sub.id}>
                                      <div className="flex items-center gap-2">
                                        <span
                                          className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-lg bg-slate-800/80 text-slate-200 text-sm font-semibold lowercase"
                                          title={`Podpunkt ${sub.id} — maksymalnie ${sub.max_points} pkt`}
                                          aria-hidden="true"
                                        >
                                          {sub.id}
                                        </span>
                                        <label
                                          htmlFor={`grade-sub-points-${row.task_number}-${sub.id}`}
                                          className="sr-only"
                                        >
                                          Punkty za podpunkt {sub.id} w zadaniu {row.task_number}
                                        </label>
                                        <input
                                          id={`grade-sub-points-${row.task_number}-${sub.id}`}
                                          type="number"
                                          inputMode="numeric"
                                          min="0"
                                          max={sub.max_points}
                                          step="0.5"
                                          value={sub.points}
                                          onChange={(e) =>
                                            updateSubPoint(row.task_number, sub.id, e.target.valueAsNumber || 0)
                                          }
                                          className="w-20 px-3 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm tabular-nums min-h-11"
                                        />
                                        <span className="text-xs text-slate-400 tabular-nums shrink-0">
                                          / {sub.max_points}
                                        </span>
                                        {sub.certainty && sub.certainty !== 'certain' && (
                                          <span
                                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap bg-amber-950/40 text-amber-400 border-amber-800/50"
                                            title={
                                              typeof sub.confidence === 'number'
                                                ? `Pewność tego podpunktu: ${sub.confidence}%. Ciągnie pewność zadania i całej pracy w dół.`
                                                : undefined
                                            }
                                          >
                                            {certaintyLabel(sub.certainty)}
                                            {typeof sub.confidence === 'number' ? ` · ${sub.confidence}%` : ''}
                                          </span>
                                        )}
                                      </div>

                                      {row.gradedByAi && sub.transcription && (
                                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed pl-9">
                                          AI odczytał: <span className="text-slate-200">„{sub.transcription}”</span>
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                <p className="text-xs text-slate-400 mt-3 tabular-nums">
                                  Razem{' '}
                                  <span className="font-semibold text-slate-200">{row.points}</span> / {row.max_points}{' '}
                                  pkt
                                </p>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 mb-3">
                                <label
                                  htmlFor={`grade-points-${row.task_number}`}
                                  className="text-xs font-medium text-slate-400"
                                >
                                  Punkty
                                </label>
                                <input
                                  id={`grade-points-${row.task_number}`}
                                  type="number"
                                  inputMode="numeric"
                                  min="0"
                                  max={row.max_points}
                                  step="0.5"
                                  value={row.points}
                                  onChange={(e) => updateRow(row.task_number, { points: e.target.valueAsNumber || 0 })}
                                  className="w-20 px-3 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm tabular-nums min-h-11"
                                />
                                <span className="text-xs text-slate-400 tabular-nums shrink-0">
                                  / {row.max_points}
                                </span>
                              </div>
                            )}

                            <label
                              htmlFor={`grade-comment-${row.task_number}`}
                              className="block text-xs font-medium text-slate-400 mb-2"
                            >
                              Komentarz
                            </label>
                            <textarea
                              id={`grade-comment-${row.task_number}`}
                              value={row.comment}
                              onChange={(e) => updateRow(row.task_number, { comment: e.target.value })}
                              rows={2}
                              placeholder="np. Błąd rachunku w drugim kroku"
                              className="w-full px-3 sm:px-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm resize-none"
                            />

                            {row.gradedByAi && row.sub_items.length === 0 && row.transcription && (
                              <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                                AI odczytał z kartki:{' '}
                                <span className="text-slate-200">„{row.transcription}”</span>
                              </p>
                            )}

                            {!row.edited && row.sub_items.length === 0 && row.points === 0 && !row.gradedByAi && (
                              <p className="text-xs text-slate-400 mt-2">AI nie ocenił tego zadania — uzupełnij punkty.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Notes + verification */}
                  <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5 space-y-4">
                    <div>
                      <label htmlFor="grade-notes" className="block text-sm font-medium text-slate-300 mb-2">
                        Notatki nauczyciela
                      </label>
                      <textarea
                        id="grade-notes"
                        value={notes}
                        onChange={(e) => {
                          setNotes(e.target.value);
                          setSavedMessage('');
                        }}
                        rows={3}
                        placeholder="Widoczne tylko dla Ciebie przy tej pracy"
                        className="w-full px-3 sm:px-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm resize-none"
                      />
                    </div>

                    <label
                      htmlFor="grade-verify"
                      className={`flex items-start gap-3 p-3 rounded-xl border border-slate-800/60 bg-slate-900/50 ${
                        grade.manually_verified ? 'cursor-default' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        id="grade-verify"
                        type="checkbox"
                        checked={isVerified}
                        disabled={grade.manually_verified}
                        onChange={(e) => {
                          setMarkVerified(e.target.checked);
                          setSavedMessage('');
                        }}
                        className="mt-0.5 w-5 h-5 accent-blue-600 cursor-pointer"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-200">Oznacz jako zweryfikowaną</span>
                        <span className="block text-xs text-slate-400 mt-1">
                          {grade.manually_verified
                            ? 'Ta praca jest już oznaczona jako zweryfikowana.'
                            : 'Potwierdza, że sprawdziłeś tę pracę ręcznie.'}
                        </span>
                      </span>
                    </label>

                    {savedMessage && (
                      <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-xl" role="status">
                        <p className="text-sm text-emerald-400 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                          {savedMessage}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer: live total + actions */}
              <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 min-w-0">
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wider">Suma punktów</p>
                      <p className="text-lg sm:text-xl font-bold text-slate-100 tabular-nums">
                        {liveTotal} / {totalPoints}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wider">Ocena</p>
                      <p className="text-lg sm:text-xl font-bold text-slate-100 tabular-nums">
                        {calculatedGrade ?? (session?.grade_threshold ? '—' : 'Brak progów ocen')}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 sm:justify-end shrink-0">
                    <button
                      type="button"
                      onClick={() => navigate(`/history/${sessionId}`)}
                      className="inline-flex items-center justify-center px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer min-h-11 font-medium disabled:opacity-50"
                      disabled={isSaving}
                    >
                      Anuluj
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving || rows.length === 0}
                      className="flex sm:inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer min-h-11 font-medium"
                    >
                      <Save className="w-5 h-5" aria-hidden="true" />
                      {isSaving ? 'Zapisywanie…' : 'Zapisz poprawki'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
