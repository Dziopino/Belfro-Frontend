import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { classesAPI, gradingAPI } from '../services/apiService';
import { decryptData } from '../services/cryptoService';
import { sessionTitle } from '../utils/grading';
import { pluralPolish } from '../utils/polish';
import type { Class, GradingSessionSummary } from '../types';
import Sidebar from '../components/Sidebar';
import HeaderAccount from '../components/HeaderAccount';
import ClassSelectionModal from '../components/ClassSelectionModal';
import LowBalanceNotice from '../components/LowBalanceNotice';
import {
  Users,
  UserPlus,
  FileText,
  PlayCircle,
  History,
  Zap,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Archive,
  ClipboardList,
} from 'lucide-react';

// Pasek uwagi liczy z jednego okna sesji, bo jedyny endpoint listowy jest paginowany.
const SESSIONS_WINDOW = 50;
const TABLE_ROWS = 5;

function pagesWord(count: number): string {
  return pluralPolish(count, 'strona', 'strony', 'stron');
}

function worksWord(count: number): string {
  return pluralPolish(count, 'praca', 'prace', 'prac');
}

function sessionsWord(count: number): string {
  return pluralPolish(count, 'sesja', 'sesje', 'sesji');
}

function classesWord(count: number): string {
  return pluralPolish(count, 'klasie', 'klasach', 'klasach');
}

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function NewDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showClassModal, setShowClassModal] = useState(false);

  const [classes, setClasses] = useState<Class[]>([]);
  const [classNames, setClassNames] = useState<Record<string, string>>({});
  const [sessions, setSessions] = useState<GradingSessionSummary[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      // Szkielety tylko przy pierwszym ładowaniu — odświeżenie nie może zamienić danych w placeholdery.
      if (classes.length === 0 && sessions.length === 0) setIsLoading(true);
      setError('');

      const [classesResponse, sessionsResponse] = await Promise.all([
        classesAPI.getClasses(),
        gradingAPI.getSessions({ limit: SESSIONS_WINDOW }),
      ]);

      setClasses(classesResponse.classes);
      setSessions(sessionsResponse.sessions);
      setSessionTotal(sessionsResponse.total_count);
      await decryptClassNames(sessionsResponse.sessions);
    } catch {
      setError('Nie udało się załadować danych pulpitu. Sprawdź połączenie i spróbuj ponownie.');
    } finally {
      setIsLoading(false);
    }
  };

  // Nazwy klas są zaszyfrowane po stronie klienta: deszyfrujemy w locie, raz na klasę.
  const decryptClassNames = async (rows: GradingSessionSummary[]) => {
    const decrypted: Record<string, string> = {};

    for (const row of rows) {
      if (decrypted[row.class_id] !== undefined) continue;

      if (!row.encrypted_class_name) {
        decrypted[row.class_id] = '—';
        continue;
      }

      try {
        decrypted[row.class_id] = (await decryptData(row.encrypted_class_name)) || '—';
      } catch (err) {
        console.error(`Nie udało się odszyfrować nazwy klasy ${row.class_id}:`, err);
        decrypted[row.class_id] = '—';
      }
    }

    setClassNames((previous) => ({ ...previous, ...decrypted }));
  };

  const classNameFor = (session: GradingSessionSummary) => classNames[session.class_id] ?? '—';
  const titleFor = (session: GradingSessionSummary) => sessionTitle(session, classNameFor(session));
  const openSession = (session: GradingSessionSummary) => navigate(`/history/${session.id}`);

  const studentTotal = classes.reduce((sum, cls) => sum + (cls._count?.students ?? 0), 0);
  const tableSessions = sessions.slice(0, TABLE_ROWS);

  const unfinished = sessions.filter(
    (s) => s.status === 'in_progress' || s.status === 'processing' || s.status === 'awaiting_works'
  );
  const pendingWorks = unfinished.reduce((sum, s) => sum + Math.max(s.works_count - s.graded_count, 0), 0);
  // Brakujące prace to uczniowie bez skanu i bez nieobecności — nie da się ich sprawdzić,
  // trzeba ich najpierw dorzucić do sesji, więc liczymy je osobno od prac po prostu niesprawdzonych.
  const missingSessions = unfinished.filter((s) => s.missing_count > 0);
  const missingWorks = missingSessions.reduce((sum, s) => sum + s.missing_count, 0);
  const attention = sessions.filter((s) => s.needs_verification || s.low_confidence_count > 0);
  // Lista przychodzi od najnowszej, więc ostatni element to najstarsza praca do ogarnięcia w oknie.
  const attentionTarget = attention[attention.length - 1] ?? unfinished[unfinished.length - 1];

  const attentionParts: string[] = [];
  if (pendingWorks > 0) {
    attentionParts.push(`Do sprawdzenia: ${pendingWorks} ${worksWord(pendingWorks)}`);
  }
  if (missingWorks > 0) {
    attentionParts.push(`brakujące prace: ${missingWorks} w ${unfinished.length} ${sessionsWord(unfinished.length)}`);
  }
  if (attention.length > 0) {
    attentionParts.push(`Niska pewność AI: ${attention.length} ${sessionsWord(attention.length)}`);
  }
  const hasAttention = attentionParts.length > 0;

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'bg-emerald-500';
    if (confidence >= 70) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getStatusBadge = (session: GradingSessionSummary) => {
    // Niska pewność AI jest ważniejsza niż techniczny status sesji, więc check idzie pierwszy.
    if (session.needs_verification) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-950/40 text-rose-400 border border-rose-800/50 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
          Wymaga weryfikacji
        </span>
      );
    }

    switch (session.status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-800/50 whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            Zakończone
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-950/40 text-blue-400 border border-blue-800/50 whitespace-nowrap">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            Sprawdzanie przez AI
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-950/40 text-amber-400 border border-amber-800/50 whitespace-nowrap">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            Oczekuje na sprawdzenie
          </span>
        );
      case 'awaiting_works':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-950/40 text-amber-400 border border-amber-800/50 whitespace-nowrap">
            <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
            Niedokończone
          </span>
        );
      case 'archived':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-800/60 text-slate-400 border border-slate-700 whitespace-nowrap">
            <Archive className="w-3.5 h-3.5" aria-hidden="true" />
            Zarchiwizowane
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-800/60 text-slate-400 border border-slate-700 whitespace-nowrap">
            —
          </span>
        );
    }
  };

  const pagesLeft = user?.pages_current_limit ?? null;
  const pagesProcessed = user?.pages_total_processed ?? 0;

  return (
    <div className="flex min-h-screen bg-[#0B0F19]">
      <Sidebar />

      <div className="flex-1 w-full lg:ml-64">
        {/* Header */}
        <header className="h-14 sm:h-16 bg-[#131B2E] border-b border-slate-800/60 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-10">
          <div className="flex items-center gap-3 flex-1">
            <div className="lg:hidden flex items-center gap-3 pl-12">
              <div className="font-bold text-slate-100 text-sm leading-none">BELFRO.PL</div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 ml-auto md:ml-6">
            <HeaderAccount pagesLeft={pagesLeft} />
          </div>
        </header>

        {/* Main Content */}
        <main id="main-content" tabIndex={-1} className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 mx-auto w-full max-w-6xl">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Pulpit</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Stan konta, prace oczekujące na sprawdzenie i ostatnie sesje
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-4" role="alert">
              <p className="text-sm text-rose-400">{error}</p>
              <button
                onClick={loadDashboard}
                className="mt-3 inline-flex items-center justify-center px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer min-h-11 text-sm font-medium"
              >
                Spróbuj ponownie
              </button>
            </div>
          )}

          <LowBalanceNotice />

          {/* Stats Grid */}
          {!error && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
              {/* Classes */}
              <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-400" aria-hidden="true" />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-slate-400">Łączna liczba klas</p>
                  {isLoading ? (
                    <div className="h-10 w-16 rounded bg-slate-800/70 animate-pulse motion-reduce:animate-none" />
                  ) : (
                    <p className="text-4xl font-bold text-slate-100 tabular-nums">{classes.length}</p>
                  )}
                  <p className="text-xs text-slate-400">
                    {classes.length === 0 ? 'Dodaj pierwszą klasę' : 'W Twoim koncie'}
                  </p>
                </div>
              </div>

              {/* Students */}
              <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-sky-500/20 rounded-xl flex items-center justify-center">
                    <UserPlus className="w-6 h-6 text-sky-400" aria-hidden="true" />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-slate-400">Łączna liczba uczniów</p>
                  {isLoading ? (
                    <div className="h-10 w-16 rounded bg-slate-800/70 animate-pulse motion-reduce:animate-none" />
                  ) : (
                    <p className="text-4xl font-bold text-slate-100 tabular-nums">{studentTotal}</p>
                  )}
                  <p className="text-xs text-slate-400">
                    {classes.length === 1
                      ? 'W jednej klasie'
                      : `W ${classes.length} ${classesWord(classes.length)}`}
                  </p>
                </div>
              </div>

              {/* Page quota */}
              <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5 sm:col-span-2 lg:col-span-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-emerald-400" aria-hidden="true" />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-slate-400">Saldo stron</p>
                  <p className="text-2xl font-bold text-slate-100 tabular-nums">
                    {pagesLeft === null ? '—' : `${pagesLeft} ${pagesWord(pagesLeft)}`}
                  </p>
                  <p className="text-xs text-slate-400 tabular-nums">
                    Sprawdzone łącznie: {pagesProcessed} {pagesWord(pagesProcessed)}
                  </p>
                  <button
                    onClick={() => navigate('/wallet')}
                    className="mt-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                  >
                    Doładuj konto
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div>
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" aria-hidden="true" />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100">Szybkie akcje</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <button
                onClick={() => navigate('/classes')}
                className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6 hover:bg-slate-800/30 hover:border-slate-700 transition-all duration-200 group text-left cursor-pointer"
              >
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" aria-hidden="true" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-slate-300 transition-colors" aria-hidden="true" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-100 mb-1">Zarządzaj klasami</h3>
                <p className="text-xs sm:text-sm text-slate-400">Dodaj klasę i dopisz do niej uczniów</p>
              </button>

              <button
                onClick={() => setShowClassModal(true)}
                className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6 hover:bg-slate-800/30 hover:border-slate-700 transition-all duration-200 group text-left cursor-pointer"
              >
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-sky-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <PlayCircle className="w-5 h-5 sm:w-6 sm:h-6 text-sky-400" aria-hidden="true" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-slate-300 transition-colors" aria-hidden="true" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-100 mb-1">Rozpocznij sprawdzanie prac</h3>
                <p className="text-xs sm:text-sm text-slate-400">Wybierz klasę i wprowadź klucz odpowiedzi</p>
              </button>

              <button
                onClick={() => navigate('/history')}
                className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6 hover:bg-slate-800/30 hover:border-slate-700 transition-all duration-200 group text-left cursor-pointer sm:col-span-2 lg:col-span-1"
              >
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <History className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" aria-hidden="true" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-slate-300 transition-colors" aria-hidden="true" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-100 mb-1">Historia sprawdzania</h3>
                <p className="text-xs sm:text-sm text-slate-400">
                  {sessionTotal > 0
                    ? `${sessionTotal} ${sessionsWord(sessionTotal)} na Twoim koncie`
                    : 'Wszystkie sesje znajdziesz tutaj'}
                </p>
              </button>
            </div>
          </div>

          {/* Attention strip */}
          {!isLoading && !error && hasAttention && (
            <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <AlertTriangle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-100">Wymaga Twojej uwagi</p>
                  <p className="text-xs sm:text-sm text-slate-400 mt-0.5 tabular-nums">{attentionParts.join(' · ')}</p>
                </div>
              </div>
              <Link
                to={attentionTarget ? `/history/${attentionTarget.id}` : '/history'}
                className="self-start sm:self-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors cursor-pointer min-h-11 text-sm font-medium whitespace-nowrap"
              >
                {attentionTarget ? 'Przejdź do sesji' : 'Zobacz historię'}
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          )}

          {/* Recent Gradings Table */}
          <div>
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-base sm:text-lg font-bold text-slate-100">Ostatnio sprawdzane klasy</h2>
              <button
                onClick={() => navigate('/history')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium rounded-xl transition-colors cursor-pointer text-xs sm:text-sm min-h-11"
              >
                Zobacz wszystko
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Loading */}
            {isLoading && (
              <div className="space-y-3" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 animate-pulse motion-reduce:animate-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-4 w-2/3 rounded bg-slate-800" />
                      <div className="ml-auto h-6 w-24 rounded-full bg-slate-800/70" />
                    </div>
                    <div className="mt-3 h-3 w-1/3 rounded bg-slate-800/70" />
                  </div>
                ))}
                <p className="sr-only">Ładowanie ostatnich sesji</p>
              </div>
            )}

            {/* Empty state */}
            {!isLoading && !error && tableSessions.length === 0 && (
              <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-8 sm:p-12 text-center">
                <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  {classes.length === 0 ? (
                    <Users className="w-7 h-7 text-blue-400" aria-hidden="true" />
                  ) : (
                    <PlayCircle className="w-7 h-7 text-blue-400" aria-hidden="true" />
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-100">
                  {classes.length === 0 ? 'Nie masz jeszcze żadnej klasy' : 'Nie ma jeszcze sprawdzanych prac'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
                  {classes.length === 0
                    ? 'Każdą sesję sprawdzania przypisujesz do klasy, więc bez niej nie wrzucisz prac uczniów.'
                    : 'Wrzuć zeskanowane prace wybranej klasy, a AI sprawdzi je według klucza odpowiedzi.'}
                </p>
                <button
                  onClick={() =>
                    classes.length === 0 ? navigate('/classes') : setShowClassModal(true)
                  }
                  className="mt-6 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors cursor-pointer min-h-11 font-medium"
                >
                  {classes.length === 0 ? (
                    <>
                      <Users className="w-5 h-5" aria-hidden="true" />
                      Przejdź do klas
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-5 h-5" aria-hidden="true" />
                      Rozpocznij sprawdzanie
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Mobile: Card view */}
            {!isLoading && tableSessions.length > 0 && (
              <div className="lg:hidden space-y-3">
                {tableSessions.map((session) => (
                  <div
                    key={session.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => openSession(session)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openSession(session);
                      }
                    }}
                    aria-label={`Otwórz sesję ${titleFor(session)}`}
                    className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 cursor-pointer hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-100 break-words">{titleFor(session)}</p>
                        <p className="text-xs text-slate-400 mt-1 truncate tabular-nums">
                          {formatDate(session.created_at)}
                        </p>
                      </div>
                      {getStatusBadge(session)}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center justify-center h-10 px-3 bg-blue-500/20 text-blue-400 rounded-xl font-semibold text-sm max-w-[14ch] truncate">
                        {classNameFor(session)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 tabular-nums">
                          {session.works_count} {worksWord(session.works_count)}
                        </span>
                        {session.graded_count > 0 && (
                          <>
                            <div className="w-16 h-1.5 bg-slate-800/50 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${getConfidenceColor(session.avg_confidence)}`}
                                style={{ width: `${session.avg_confidence}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-semibold text-slate-100 tabular-nums">
                              {session.avg_confidence}%
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Desktop: Table view */}
            {!isLoading && tableSessions.length > 0 && (
              <div className="hidden lg:block bg-[#131B2E] border border-slate-800/60 rounded-2xl overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead className="bg-slate-900/50 border-b border-slate-800/60">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Sprawdzian
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Klasa
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Liczba prac
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Średnia pewność AI
                      </th>
                      <th className="px-6 py-3 text-right">
                        <span className="sr-only">Akcja</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {tableSessions.map((session) => (
                      <tr
                        key={session.id}
                        tabIndex={0}
                        onClick={() => openSession(session)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openSession(session);
                          }
                        }}
                        aria-label={`Otwórz sesję ${titleFor(session)}`}
                        className="hover:bg-slate-800/20 focus:bg-slate-800/30 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div className="max-w-[40ch] min-w-0">
                            <p className="text-sm font-medium text-slate-100 break-words">{titleFor(session)}</p>
                            <p className="text-xs text-slate-400 truncate tabular-nums">
                              {[session.answer_key_subject, formatDate(session.created_at)]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center justify-center h-10 px-3 bg-blue-500/20 text-blue-400 rounded-xl font-semibold text-sm max-w-[14ch] truncate">
                            {classNameFor(session)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-slate-100 tabular-nums">{session.works_count}</p>
                          <p className="text-xs text-slate-400 tabular-nums">
                            {session.graded_count}/{session.works_count} sprawdzonych
                          </p>
                        </td>
                        <td className="px-6 py-4">{getStatusBadge(session)}</td>
                        <td className="px-6 py-4">
                          {session.graded_count === 0 ? (
                            <span className="text-sm font-semibold text-slate-400">—</span>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-slate-100 tabular-nums">
                                  {session.avg_confidence}%
                                </span>
                              </div>
                              <div className="w-32 h-1.5 bg-slate-800/50 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${getConfidenceColor(
                                    session.avg_confidence
                                  )}`}
                                  style={{ width: `${session.avg_confidence}%` }}
                                ></div>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            to={`/history/${session.id}`}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Otwórz podsumowanie sesji ${titleFor(session)}`}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Otwórz
                            <ArrowRight className="w-4 h-4" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Class Selection Modal */}
      <ClassSelectionModal isOpen={showClassModal} onClose={() => setShowClassModal(false)} />
    </div>
  );
}
