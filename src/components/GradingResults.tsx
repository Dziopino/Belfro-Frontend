import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { gradingAPI } from '../services/apiService';
import { decryptData } from '../services/cryptoService';
import { studentIdentity, UNIDENTIFIED_LABEL } from '../utils/studentIdentity';
import { LOW_CONFIDENCE_THRESHOLD, variantAwaitingChoice } from '../utils/grading';
import { buildSessionSummary, sortGradesForReview, type DecryptedGrade } from '../utils/sessionSummary';
import SessionSummaryTable from './SessionSummaryTable';
import VariantPickNotice from './VariantPickNotice';
import type { GradingSession } from '../types';
import { Sparkles } from 'lucide-react';
import { apiErrorMessage } from '../utils/apiError';

// jspdf to ciężki moduł — wchodzi dopiero, gdy nauczyciel kliknie eksport
const PdfActionsBar = lazy(() => import('./PdfActionsBar'));

interface GradingResultsProps {
  sessionId: string;
  onProcessingComplete?: () => void;
}

/** Co ile sekund pytamy licznik sprawdzonych prac, gdy /process wisi w sieci. */
const PROGRESS_POLL_MS = 2000;

interface ProgressState {
  total: number;
  done: number;
  /** Czas od pierwszego pomiaru tej rundy i przyrost licznika w tym oknie. Tempo liczymy tylko z nich. */
  elapsedMs: number;
  checkedInWindow: number;
}

/**
 * Wznowiona sesja startuje z licznikiem już częściowo pełnym — bez okna pomiaru szacunek
 * udawałby, że AI sprawdziło te prace w czasie bieżącego oczekiwania.
 */
function remainingMs(progress: ProgressState): number | null {
  if (progress.checkedInWindow <= 0 || progress.elapsedMs <= 0) return null;
  const perWork = progress.elapsedMs / progress.checkedInWindow;
  return Math.max(progress.total - progress.done, 0) * perWork;
}

function formatRemaining(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

export default function GradingResults({ sessionId, onProcessingComplete }: GradingResultsProps) {
  const navigate = useNavigate();

  const [session, setSession] = useState<GradingSession | null>(null);
  const [grades, setGrades] = useState<DecryptedGrade[]>([]);
  const [className, setClassName] = useState('—');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingResults, setIsLoadingResults] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<ProgressState | null>(null);

  // StrictMode w dev montuje effect dwukrotnie — bez tego flaga AI startuje dwa razy dla tej samej sesji
  const loadedSessionId = useRef<string | null>(null);
  const pollTimer = useRef<number | null>(null);
  const windowStart = useRef<{ at: number; done: number } | null>(null);

  useEffect(() => {
    if (loadedSessionId.current === sessionId) return;
    loadedSessionId.current = sessionId;
    loadSessionAndProcess();
  }, [sessionId]);

  // Wyjście ze strony w trakcie sprawdzania nie może zostawić tykającego interwału
  useEffect(
    () => () => {
      if (pollTimer.current !== null) clearInterval(pollTimer.current);
    },
    []
  );

  const loadSessionAndProcess = async () => {
    try {
      setIsLoadingResults(true);
      setError('');

      // Pobierz sesję
      const { session: fetchedSession } = await gradingAPI.getSession(sessionId);
      setSession(fetchedSession);

      // Status sam nie wystarczy: /process bierze wyłącznie wiersze z final_points === null.
      // Wznawiona sesja z nowymi pracami musi więc ponownie odpalić sprawdzanie.
      const fetchedGrades = fetchedSession.grades ?? [];
      const ungraded = fetchedGrades.filter((grade) => grade.final_points === null);
      // Praca bez wariantu po nieudanym rozpoznaniu nie czeka na AI, tylko na kliknięcie nauczyciela.
      // Ponowne /process pytałby modelu o każdy taki skan od nowa — świeżo dołączona praca znacznika
      // nie ma, więc ona sprawdzanie nadal odpala.
      const onlyVariantPicksLeft =
        ungraded.length > 0 && ungraded.every((grade) => variantAwaitingChoice(grade));
      const allGraded = fetchedGrades.length > 0 && ungraded.length === 0;
      const alreadyProcessed =
        (fetchedSession.status === 'completed' || fetchedSession.status === 'awaiting_works') &&
        (allGraded || onlyVariantPicksLeft);

      if (alreadyProcessed) {
        // Sesja już przetworzona - pokaż wyniki
        await loadAndDecryptResults(fetchedSession);
      } else {
        // Sesja nie jest przetworzona - uruchom AI
        await processWithAI();
      }
    } catch (err: any) {
      console.error(`Nie udało się załadować sesji ${sessionId}:`, err);
      setError(apiErrorMessage(err, 'Nie udało się załadować sesji'));
      setIsLoadingResults(false);
    }
  };

  const stopPolling = () => {
    if (pollTimer.current !== null) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  /**
   * Jedna próbka licznika. Pierwsza odpowiedź wyznacza okno pomiaru, więc tempo nie pochodzi
   * z prac sprawdzonych w poprzednich rundach tej samej sesji.
   */
  const sampleProgress = async () => {
    try {
      const snapshot = await gradingAPI.getSessionProgress(sessionId);

      if (!windowStart.current) {
        windowStart.current = { at: Date.now(), done: snapshot.processed_count };
      }

      setProgress({
        total: snapshot.total_count,
        done: snapshot.processed_count,
        elapsedMs: Date.now() - windowStart.current.at,
        checkedInWindow: snapshot.processed_count - windowStart.current.done,
      });
    } catch {
      // Utracona próbka nie przerywa sprawdzania — /process trwa po stronie serwera niezależnie od nas
    }
  };

  const processWithAI = async () => {
    try {
      setIsProcessing(true);
      setError('');
      setProgress(null);
      windowStart.current = null;

      await sampleProgress();
      pollTimer.current = window.setInterval(() => {
        void sampleProgress();
      }, PROGRESS_POLL_MS);

      // Wywołaj backend do przetworzenia przez AI
      await gradingAPI.processSession(sessionId);

      stopPolling();

      // Odśwież sesję i pokaż wyniki
      const { session: updatedSession } = await gradingAPI.getSession(sessionId);
      await loadAndDecryptResults(updatedSession);

      if (onProcessingComplete) {
        onProcessingComplete();
      }
    } catch (err: any) {
      console.error(`Nie udało się przetworzyć prac sesji ${sessionId}:`, err);
      if (err.response?.data?.code === 'SESSION_ALREADY_PROCESSING') {
        setError('Przetwarzanie już trwa w innym oknie. Odczekaj chwilę i odśwież stronę.');
      } else {
        setError(apiErrorMessage(err, 'Nie udało się przetworzyć prac przez AI'));
      }
    } finally {
      stopPolling();
      setIsProcessing(false);
      setIsLoadingResults(false);
    }
  };

  const loadAndDecryptResults = async (sessionData: GradingSession) => {
    try {
      if (!sessionData.grades || sessionData.grades.length === 0) {
        setError('Brak ocen do wyświetlenia');
        setIsLoadingResults(false);
        return;
      }

      // Odszyfruj dane uczniów — etykietę liczy utils/studentIdentity, więc klasa numerowana
      // wychodzi z tej pętli jako „Nr 12", a nie jako para myślników.
      const decryptedGrades: DecryptedGrade[] = [];

      for (const grade of sessionData.grades) {
        const identity = grade.student ? await studentIdentity(grade.student) : null;

        decryptedGrades.push({
          ...grade,
          student_name: identity?.label ?? UNIDENTIFIED_LABEL,
          student_number: identity?.number ?? UNIDENTIFIED_LABEL,
        });
      }

      // Nazwa klasy jest w nagłówku arkusza i w nazwie pliku PDF — bez niej wydruk jest bezimienny
      if (sessionData.class?.encrypted_name) {
        try {
          setClassName((await decryptData(sessionData.class.encrypted_name)) || '—');
        } catch (err) {
          console.error(`Nie udało się odszyfrować nazwy klasy ${sessionData.class_id}:`, err);
          setClassName('—');
        }
      }

      setGrades(sortGradesForReview(decryptedGrades));
      setSession(sessionData);
      setIsLoadingResults(false);
    } catch (err) {
      console.error(`Nie udało się odszyfrować wyników sesji ${sessionId}:`, err);
      setError('Nie udało się odszyfrować wyników');
      setIsLoadingResults(false);
    }
  };

  if (isProcessing) {
    const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    const eta = progress ? remainingMs(progress) : null;

    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-6 sm:p-10 text-center">
          <div className="mx-auto w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-4">
            <Sparkles className="w-7 h-7 text-blue-400" aria-hidden="true" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-100">AI sprawdza prace</h2>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            Nie zamykaj tej strony. Każda praca jest sprawdzana osobno, więc wyniki przychodzą jeden po drugim.
          </p>

          <div className="mt-6 max-w-md mx-auto" role="status" aria-live="polite">
            <div className="w-full h-2 bg-slate-800/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-700 motion-reduce:transition-none"
                style={{ width: `${percent}%` }}
              />
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-3 text-sm text-slate-300 tabular-nums">
              <span>{progress ? `Sprawdzone prace: ${progress.done} z ${progress.total}` : 'Pytam o postęp…'}</span>
              <span className="text-slate-400">{percent}%</span>
            </div>

            <p className="mt-1 text-xs sm:text-sm text-slate-400 tabular-nums">
              {eta === null
                ? 'Czas do końca podam po pierwszej sprawdzonej pracy.'
                : `Pozostało: ${formatRemaining(eta)}`}
            </p>
          </div>

          <div className="mt-6 p-4 bg-blue-950/40 border border-blue-800/50 rounded-xl">
            <p className="text-xs sm:text-sm text-blue-300 leading-relaxed">
              AI rozpoznaje pismo, porównuje je z kluczem odpowiedzi, przyznaje punkty i pisze komentarz.
              Szacunek czasu liczę z dotychczasowego tempa, więc zmienia się w trakcie sprawdzania — część prac
              trafia do lepszego modelu i trwa dłużej.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoadingResults) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin motion-reduce:animate-none rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-sm text-slate-400">Ładowanie wyników…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-rose-950/40 border border-rose-800/50 rounded-2xl p-6" role="alert">
          <p className="text-sm text-rose-300">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="mt-4 inline-flex items-center justify-center px-4 py-2.5 min-h-11 bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium rounded-xl transition-colors cursor-pointer"
          >
            Powrót na pulpit
          </button>
        </div>
      </div>
    );
  }

  if (!session || grades.length === 0) {
    return (
      <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-8 sm:p-12 text-center">
        <p className="text-sm sm:text-base font-medium text-slate-100">Brak wyników do wyświetlenia</p>
        <p className="text-xs sm:text-sm text-slate-400 mt-2">
          Ta sesja nie ma jeszcze żadnej sprawdzonej pracy
        </p>
      </div>
    );
  }

  // Ten sam adapter co na historii: te same progi, poprawki nauczyciela nadpisujące AI i ta sama
  // punktacja per grupa — inaczej panel wyników i PDF mówiłyby innymi liczbami.
  const summary = buildSessionSummary(session, grades, className);
  const graded = summary.grades.filter((row) => row.finalPoints !== null);
  const needsVerificationCount = graded.filter((row) => row.confidenceScore < LOW_CONFIDENCE_THRESHOLD).length;
  const awaitingVariantCount = summary.grades.filter((row) => row.variantMissing).length;
  const avgConfidence =
    graded.length === 0 ? null : graded.reduce((sum, row) => sum + row.confidenceScore, 0) / graded.length;

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5">
          <p className="text-sm text-slate-400">Sprawdzone prace</p>
          <p className="text-2xl font-bold text-slate-100 tabular-nums mt-1">
            {graded.length}
            {graded.length < summary.grades.length ? (
              <span className="text-base font-normal text-slate-400"> z {summary.grades.length}</span>
            ) : null}
          </p>
        </div>

        <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5">
          <p className="text-sm text-slate-400">Średnia pewność AI</p>
          <p className="text-2xl font-bold text-slate-100 tabular-nums mt-1">
            {avgConfidence === null ? '—' : `${avgConfidence.toFixed(0)}%`}
          </p>
          <p className="text-xs text-slate-400 mt-1">tylko z prac już sprawdzonych</p>
        </div>

        <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5">
          <p className="text-sm text-slate-400">Wymaga weryfikacji</p>
          <p
            className={`text-2xl font-bold tabular-nums mt-1 ${
              needsVerificationCount > 0 ? 'text-rose-400' : 'text-slate-100'
            }`}
          >
            {needsVerificationCount}
          </p>
          <p className="text-xs text-slate-400 mt-1 tabular-nums">pewność poniżej {LOW_CONFIDENCE_THRESHOLD}%</p>
        </div>
      </div>

      <VariantPickNotice count={awaitingVariantCount} />

      <Suspense fallback={null}>
        <PdfActionsBar data={summary} />
      </Suspense>

      {needsVerificationCount > 0 && (
        <div className="bg-amber-950/40 border border-amber-800/50 rounded-xl p-3 sm:p-4" role="status">
          <p className="text-sm text-amber-300">
            Prace wyróżnione w tabeli mają pewność AI poniżej {LOW_CONFIDENCE_THRESHOLD}%. Kliknij wiersz, żeby
            zobaczyć skan z przyznanymi punktami, i popraw oceny przed wpisaniem ich do dziennika.
          </p>
        </div>
      )}

      <SessionSummaryTable
        data={summary}
        onOpenGrade={(gradeId) => navigate(`/history/${sessionId}/grade/${gradeId}`)}
      />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center justify-center px-4 py-2.5 min-h-11 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-100 text-sm font-medium rounded-xl transition-colors cursor-pointer"
        >
          Powrót na pulpit
        </button>
      </div>
    </div>
  );
}
