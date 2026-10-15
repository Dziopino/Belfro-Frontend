import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { gradingAPI } from '../services/apiService';
import { decryptData } from '../services/cryptoService';
import { studentIdentity, UNIDENTIFIED_LABEL } from '../utils/studentIdentity';
import { sessionTitle } from '../utils/grading';
import { buildSessionSummary, sortGradesForReview, type DecryptedGrade } from '../utils/sessionSummary';
import SessionSummaryTable from '../components/SessionSummaryTable';
import VariantPickNotice from '../components/VariantPickNotice';
import ConfirmDialog from '../components/ConfirmDialog';
import { pluralPolish } from '../utils/polish';
import type { GradingSession } from '../types';
import Sidebar from '../components/Sidebar';
import HeaderAccount from '../components/HeaderAccount';
import { ArrowLeft, Bell, FileText, PlayCircle, Trash2 } from 'lucide-react';
import { apiErrorMessage } from '../utils/apiError';

// jspdf to ciężki moduł — wchodzi dopiero, gdy nauczyciel rozwinie pasek PDF
const PdfActionsBar = lazy(() => import('../components/PdfActionsBar'));

const formatDate = (iso: string): string => new Date(iso).toLocaleDateString('pl-PL');

function worksWord(count: number): string {
  return pluralPolish(count, 'praca', 'prace', 'prac');
}

type Attendance = { absentCount: number; missingCount: number };

/**
 * Treść kart ostrzeżenia nad tabelą. Zwraca pusty string, gdy nie ma nic do komunikowania —
 * liczniki są w formie „brakujące prace: 3" bez odmiany rzeczownika po liczebniku, bo ta sama
 * fraza musi być poprawna dla każdej liczby uczniów.
 */
function sessionAttentionText(session: GradingSession, attendance: Attendance): string {
  if (session.status === 'processing') {
    return 'Ta sesja jest właśnie sprawdzana przez AI. Wyniki pojawią się po zakończeniu.';
  }

  if (attendance.missingCount > 0) {
    const hasWorks = (session.grades?.length ?? 0) > 0;
    const absent = attendance.absentCount > 0 ? ` Nieobecni: ${attendance.absentCount}.` : '';

    return `${hasWorks ? 'W tej sesji brakuje prac' : 'Brakujące prace'}: ${attendance.missingCount}.${absent}`;
  }

  // Sesja może być już „completed", a mimo to mieć nieobecnych — im praca dopiero się należy
  if (attendance.absentCount > 0) {
    return `Nieobecni: ${attendance.absentCount}. Dodaj ich prace, gdy napiszą sprawdzian w innym terminie.`;
  }

  return '';
}

export default function HistorySessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<GradingSession | null>(null);
  const [grades, setGrades] = useState<DecryptedGrade[]>([]);
  const [className, setClassName] = useState('—');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    loadSession(sessionId);
  }, [sessionId]);

  const loadSession = async (id: string) => {
    try {
      setIsLoading(true);
      setError('');

      const { session: fetched } = await gradingAPI.getSession(id);
      setSession(fetched);

      if (fetched.class?.encrypted_name) {
        try {
          setClassName((await decryptData(fetched.class.encrypted_name)) || '—');
        } catch (err) {
          console.error(`Nie udało się odszyfrować nazwy klasy ${fetched.class_id}:`, err);
          setClassName('—');
        }
      }

      const decrypted: DecryptedGrade[] = [];

      for (const grade of fetched.grades ?? []) {
        const identity = grade.student ? await studentIdentity(grade.student) : null;

        decrypted.push({
          ...grade,
          student_name: identity?.label ?? UNIDENTIFIED_LABEL,
          student_number: identity?.number ?? UNIDENTIFIED_LABEL,
        });
      }

      setGrades(sortGradesForReview(decrypted));
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się załadować szczegółów sesji'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!session) return;

    try {
      setIsDeleting(true);
      setError('');
      await gradingAPI.deleteSession(session.id);
      navigate('/history');
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się usunąć sesji'));
      setIsConfirmingDelete(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const summary = useMemo(
    () => (session ? buildSessionSummary(session, grades, className) : null),
    [session, grades, className]
  );

  // Uzupełnienie klasy: uczeń jest „obsłużony”, gdy ma pracę LUB ma oznaczoną nieobecność.
  // Sumowanie zbiorów, nie dwóch liczników, inaczej nieobecny ze wstrzykniętą później pracą
  // dałby ujemne braki.
  const attendance = useMemo<Attendance>(() => {
    if (!session) return { absentCount: 0, missingCount: 0 };

    const absentIds = new Set(session.absent_student_ids ?? []);
    const covered = new Set<string>(absentIds);
    for (const grade of session.grades ?? []) covered.add(grade.student_id);

    const groups = session.session_groups ?? [];

    // Grupa zamyka population w sobie: uczeń spoza wszystkich list nigdy nie miał tu napisać pracy,
    // więc nie może być liczony do braków (po stronie backendu robi to groupPopulationIds).
    if (groups.length > 0) {
      const population = new Set(groups.flatMap((group) => group.student_ids));
      const missing = [...population].filter((id) => !covered.has(id)).length;
      return { absentCount: absentIds.size, missingCount: missing };
    }

    const classSize = session.class?._count?.students ?? 0;
    return { absentCount: absentIds.size, missingCount: Math.max(classSize - covered.size, 0) };
  }, [session]);

  const attentionText = session ? sessionAttentionText(session, attendance) : '';
  const workCount = session?.grades?.length ?? 0;
  const hasWorks = workCount > 0;
  const resumeLabel =
    attendance.missingCount > 0
      ? hasWorks
        ? 'Dokończ sprawdzanie'
        : 'Dodaj prace'
      : 'Dodaj prace nieobecnych';
  const canResume =
    !!session &&
    (attendance.missingCount > 0 || attendance.absentCount > 0) &&
    session.status !== 'processing' &&
    session.status !== 'archived';

  // Amber = ktoś zalega z pracą już teraz; blue = nieobecni, którym praca dopiero się należy
  const attentionTone =
    attendance.missingCount > 0
      ? 'bg-amber-950/40 border-amber-800/50 text-amber-300'
      : 'bg-blue-950/40 border-blue-800/50 text-blue-300';

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
              onClick={() => navigate('/history')}
              title="Powrót"
              aria-label="Powrót"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium rounded-xl transition-colors text-xs whitespace-nowrap cursor-pointer min-h-11"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Powrót</span>
            </button>

            <div className="hidden sm:block border-l border-slate-800/60 pl-4 min-w-0">
              <h1 className="text-lg font-bold text-slate-100 truncate">
                {session ? sessionTitle(session, className) : 'Historia sprawdzania prac'}
              </h1>
              {session && (
                <p className="text-xs text-slate-400 truncate">
                  Klasa {className} • <time dateTime={session.created_at}>{formatDate(session.created_at)}</time>
                  {session.grade_threshold ? ` • Progi: ${session.grade_threshold.name}` : ''}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 ml-auto shrink-0">
            {session && (
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                disabled={session.status === 'processing'}
                title={
                  session.status === 'processing'
                    ? 'Sesja jest właśnie sprawdzana przez AI — odczekaj chwilę'
                    : 'Usuń sesję'
                }
                aria-label="Usuń sesję"
                className="group inline-flex items-center justify-center p-2 rounded-xl hover:bg-rose-500/10 transition-colors cursor-pointer min-h-11 min-w-11 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Trash2 className="w-5 h-5 text-slate-400 group-hover:text-rose-400" aria-hidden="true" />
              </button>
            )}
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
          {/* Na urządzeniach mobilnych tytuł sesji nie mieści się w headerze, więc jest tutaj */}
          <div className="sm:hidden min-w-0">
            <h1 className="text-base font-bold text-slate-100">
              {session ? sessionTitle(session, className) : 'Historia sprawdzania prac'}
            </h1>
            {session && (
              <p className="text-xs text-slate-400 mt-0.5">
                Klasa {className} • <time dateTime={session.created_at}>{formatDate(session.created_at)}</time>
                {session.grade_threshold ? ` • Progi: ${session.grade_threshold.name}` : ''}
              </p>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 sm:p-4 bg-rose-950/40 border border-rose-800/50 rounded-xl" role="alert">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div
              className="bg-[#131B2E] border border-slate-800/60 rounded-2xl overflow-hidden animate-pulse motion-reduce:animate-none"
              aria-busy="true"
            >
              <div className="px-4 sm:px-6 py-4 border-b border-slate-800/60 space-y-2">
                <div className="h-5 w-48 rounded bg-slate-800" />
                <div className="h-3 w-72 rounded bg-slate-800/70" />
              </div>
              <div className="p-4 sm:p-6 space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="h-4 w-10 rounded bg-slate-800/70" />
                    <div className="h-4 w-40 rounded bg-slate-800" />
                    <div className="ml-auto h-4 w-16 rounded bg-slate-800/70" />
                    <div className="h-4 w-12 rounded bg-slate-800/70" />
                    <div className="h-6 w-14 rounded-lg bg-slate-800/60" />
                  </div>
                ))}
              </div>
              <p className="sr-only">Ładowanie wyników sesji</p>
            </div>
          )}

          {!isLoading && attentionText && (
            <div
              className={`p-3 sm:p-4 border rounded-xl flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 ${attentionTone}`}
              role="status"
            >
              <p className="text-sm flex-1">{attentionText}</p>
              {canResume && session && (
                <div className="flex sm:justify-end shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/grading/${session.class_id}?session=${session.id}`)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors text-sm cursor-pointer min-h-11 whitespace-nowrap"
                  >
                    <PlayCircle className="w-4 h-4" aria-hidden="true" />
                    {resumeLabel}
                  </button>
                </div>
              )}
            </div>
          )}

          {!isLoading && session && grades.length === 0 && (
            <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-8 sm:p-12 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-500/20 rounded-2xl mb-4">
                <FileText className="w-7 h-7 text-blue-400" aria-hidden="true" />
              </div>
              <p className="text-sm sm:text-base font-medium text-slate-100">
                Do tej sesji nie przesłano jeszcze żadnej pracy
              </p>
              <p className="text-xs sm:text-sm text-slate-400 mt-2">
                Skany prac pojawią się tutaj po dodaniu ich w kreatorze sprawdzania
              </p>
            </div>
          )}

          {!isLoading && summary && summary.grades.length > 0 && (
            <>
              <VariantPickNotice count={summary.grades.filter((row) => row.variantMissing).length} />

              <Suspense fallback={null}>
                <PdfActionsBar data={summary} />
              </Suspense>

              <SessionSummaryTable
                data={summary}
                onOpenGrade={(gradeId) => navigate(`/history/${sessionId}/grade/${gradeId}`)}
              />
            </>
          )}
        </main>
      </div>

      <ConfirmDialog
        open={isConfirmingDelete}
        isBusy={isDeleting}
        title="Usunąć tę sesję bezpowrotnie?"
        description={
          hasWorks ? (
            <>
              Znikną oceny ({workCount} {worksWord(workCount)}) razem z zanonimizowanymi skanami prac. Tej operacji
              nie da się cofnąć, a strony już zużyte na sprawdzenie nie wrócą do limitu.
            </>
          ) : (
            <>
              Ta sesja nie ma jeszcze żadnej pracy, więc zniknie tylko jej wpis w historii. Tej operacji nie da się
              cofnąć.
            </>
          )
        }
        confirmLabel={isDeleting ? 'Usuwanie…' : 'Tak, usuń sesję'}
        onConfirm={handleDeleteSession}
        onCancel={() => setIsConfirmingDelete(false)}
      />
    </div>
  );
}
