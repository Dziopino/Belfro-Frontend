import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gradingAPI } from '../services/apiService';
import { decryptData } from '../services/cryptoService';
import { sessionTitle } from '../utils/grading';
import { pluralPolish } from '../utils/polish';
import { apiErrorMessage } from '../utils/apiError';
import type { GradingSessionSummary } from '../types';
import Sidebar from '../components/Sidebar';
import HeaderAccount from '../components/HeaderAccount';
import {
  Search,
  Bell,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Archive,
  ClipboardList,
  History,
  ArrowRight,
  PlayCircle,
  Layers,
} from 'lucide-react';

const PAGE_SIZE = 50;

const formatDate = (iso: string): string => new Date(iso).toLocaleDateString('pl-PL');

// Skrót uuid w kolumnie ID — pełny identyfikator i tak niesie adres strony
const shortId = (id: string): string => id.slice(0, 8);

function confidenceBarColor(confidence: number): string {
  if (confidence >= 80) return 'bg-emerald-500';
  if (confidence >= 70) return 'bg-amber-500';
  return 'bg-rose-500';
}

/**
 * Co sesji brakuje z punktu widzenia klasy: prace bez skanu i uczniowie oznaczeni jako nieobecni.
 * Celowo bez odmieniania rzeczownika po liczebniku — „brakujące prace: 3" jest poprawne dla każdej liczby.
 */
function attendanceNote(session: GradingSessionSummary): string {
  const parts: string[] = [];

  if (session.missing_count > 0) parts.push(`brakujące prace: ${session.missing_count}`);
  if (session.absent_count > 0) parts.push(`nieobecni: ${session.absent_count}`);

  return parts.join(' · ');
}

/**
 * Kolejka uzupełniania jest otwarta, gdy ktokolwiek jeszcze ma dostać pracę: nieobecny
 * (sesja może być już „completed") albo uczeń bez skanu i bez nieobecności.
 */
function canOpenQueue(session: GradingSessionSummary): boolean {
  if (session.status === 'processing' || session.status === 'archived') return false;
  return session.missing_count > 0 || session.absent_count > 0;
}

function StatusBadge({ session }: { session: GradingSessionSummary }) {
  // Sprawdzona, ale niepewna — to informacja ważniejsza niż sam status techniczny sesji
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
    case 'awaiting_works':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-950/40 text-amber-400 border border-amber-800/50 whitespace-nowrap">
          <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
          Niedokończone
        </span>
      );
    case 'processing':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-950/40 text-blue-400 border border-blue-800/50 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          W trakcie sprawdzania
        </span>
      );
    case 'archived':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-800/60 text-slate-400 border border-slate-700 whitespace-nowrap">
          <Archive className="w-3.5 h-3.5" aria-hidden="true" />
          Archiwizowane
        </span>
      );
    default:
      return session.graded_count === 0 ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-800/60 text-slate-400 border border-slate-700 whitespace-nowrap">
          <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
          Oczekuje na sprawdzenie
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-950/40 text-amber-400 border border-amber-800/50 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          Sprawdzane częściowo
        </span>
      );
  }
}

/**
 * Sesja z grupami ma własny klucz odpowiedzi na grupę — nauczyciel musi to widzieć już na liście,
 * bo inaczej wydrukuje arkusz z jednym maksimum dla całej klasy.
 */
function GroupsBadge({ session }: { session: GradingSessionSummary }) {
  const groups = session.session_groups ?? [];
  if (groups.length === 0) return null;

  const count = groups.length;
  return (
    <span
      title={groups.map((group) => `${group.name}: ${group.students_count}`).join(', ')}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-slate-800/60 text-slate-400 border border-slate-700 whitespace-nowrap tabular-nums shrink-0"
    >
      <Layers className="w-3.5 h-3.5" aria-hidden="true" />
      {count} {pluralPolish(count, 'grupa', 'grupy', 'grup')}
    </span>
  );
}

export default function HistoryPage() {
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<GradingSessionSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [classNames, setClassNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadSessions(0);
  }, []);

  const loadSessions = async (offset: number) => {
    try {
      setError('');
      if (offset === 0) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      const { sessions: fetched, total_count } = await gradingAPI.getSessions({
        limit: PAGE_SIZE,
        offset,
      });

      setSessions((previous) => (offset === 0 ? fetched : [...previous, ...fetched]));
      setTotalCount(total_count);
      await decryptClassNames(fetched);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się załadować historii sprawdzania prac'));
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  // Nazwy klas są zaszyfrowane po stronie klienta: deszyfrujemy w locie, raz na klasę
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

  const titleFor = (session: GradingSessionSummary) => sessionTitle(session, classNames[session.class_id] ?? '—');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sessions;

    return sessions.filter((session) => {
      const haystack = [titleFor(session), classNames[session.class_id], session.answer_key_subject]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [sessions, query, classNames]);

  const openSession = (session: GradingSessionSummary) => navigate(`/history/${session.id}`);

  // Checklista obecności w kreatorze ma zapisaną listę nieobecnych — odznaczenie osoby daje kolejkę tylko dla niej
  const openQueue = (session: GradingSessionSummary) =>
    navigate(`/grading/${session.class_id}?session=${session.id}`);

  const hasMore = totalCount > sessions.length;

  return (
    <div className="flex min-h-screen bg-[#0B0F19]">
      <Sidebar />

      <div className="flex-1 w-full min-w-0 lg:ml-64">
        {/* Header */}
        <header className="h-14 sm:h-16 bg-[#131B2E] border-b border-slate-800/60 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-10">
          {/* Mobile: rezerwujemy miejsce na hamburger, który jest fixed top-3 left-4 */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="lg:hidden flex items-center gap-3 pl-12">
              <div className="font-bold text-slate-100 text-sm leading-none">BELFRO.PL</div>
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

        <main id="main-content" tabIndex={-1} className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 mx-auto w-full max-w-6xl">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Historia sprawdzania prac</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Wszystkie sesje sprawdzania, najnowsze na górze. Kliknij wiersz, aby zobaczyć wyniki
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 sm:p-4 bg-rose-950/40 border border-rose-800/50 rounded-xl" role="alert">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}

          {/* Search */}
          {!isLoading && sessions.length > 0 && (
            <div>
              <label htmlFor="history-search" className="sr-only">
                Szukaj po nazwie lub klasie
              </label>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="history-search"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base"
                  placeholder="Szukaj po nazwie lub klasie"
                />
              </div>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div
              className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5 animate-pulse motion-reduce:animate-none space-y-3"
              aria-busy="true"
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-4 w-1/3 rounded bg-slate-800" />
                  <div className="h-4 w-16 rounded bg-slate-800/70" />
                  <div className="h-6 w-24 rounded-full bg-slate-800/60" />
                  <div className="ml-auto h-4 w-12 rounded bg-slate-800/70" />
                </div>
              ))}
              <p className="sr-only">Ładowanie historii sprawdzania prac</p>
            </div>
          )}

          {/* Empty states */}
          {!isLoading && sessions.length === 0 && (
            <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-8 sm:p-12 text-center">
              <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <History className="w-7 h-7 text-blue-400" aria-hidden="true" />
              </div>
              <h2 className="text-base sm:text-lg font-semibold text-slate-100">
                Nie ma jeszcze sprawdzonych prac
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
                Historia pojawi się sama, gdy skończysz pierwszą sesję sprawdzania. Tutaj wrócisz do
                wyników każdego sprawdzianu i pobierzesz je jako PDF.
              </p>
              <button
                onClick={() => navigate('/dashboard')}
                className="mt-6 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors cursor-pointer min-h-11 font-medium"
              >
                Przejdź do pulpitu
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          )}

          {!isLoading && sessions.length > 0 && filtered.length === 0 && (
            <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-8 text-center" role="status">
              <h2 className="text-base font-semibold text-slate-100">
                Brak sesji dla frazy „{query}”
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-2">
                Szukamy po nazwie sprawdzianu, klasie i przedmiocie — tylko w załadowanych sesjach.
              </p>
              <button
                onClick={() => setQuery('')}
                className="mt-5 inline-flex items-center justify-center px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer min-h-11 text-sm font-medium"
              >
                Wyczyść wyszukiwanie
              </button>
            </div>
          )}

          {filtered.length > 0 && (
            <div>
              {/* Mobile: Card view */}
              <div className="lg:hidden space-y-3">
                {filtered.map((session) => {
                  const className = classNames[session.class_id] ?? '—';
                  const note = attendanceNote(session);

                  return (
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
                      className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 cursor-pointer min-h-11 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-100 break-words">{titleFor(session)}</p>
                          <p className="text-xs text-slate-400 mt-1 tabular-nums">
                            {shortId(session.id)} • {formatDate(session.created_at)}
                          </p>
                        </div>
                        <StatusBadge session={session} />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="inline-flex items-center justify-center px-2 py-1 bg-blue-500/20 text-blue-400 rounded-lg font-semibold text-xs max-w-[12ch] truncate">
                            {className}
                          </span>
                          <GroupsBadge session={session} />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-slate-400 tabular-nums">
                            {session.graded_count}/{session.works_count} prac
                          </span>
                          {session.graded_count === 0 ? (
                            <span className="text-xs font-semibold text-slate-400">—</span>
                          ) : (
                            <>
                              <div className="w-16 h-1.5 bg-slate-800/50 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${confidenceBarColor(
                                    session.avg_confidence
                                  )}`}
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
                      {(note || canOpenQueue(session)) && (
                        <div className="flex items-end justify-between gap-3 mt-3">
                          {note && <p className="text-xs text-amber-400 tabular-nums min-w-0">{note}</p>}
                          {canOpenQueue(session) && (
                            <button
                              type="button"
                              title="Wybierz nieobecnych lub uczniów bez pracy i dodaj ich prace"
                              aria-label={`Dodaj prace w sesji ${titleFor(session)}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                openQueue(session);
                              }}
                              onKeyDown={(event) => event.stopPropagation()}
                              className="ml-auto inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors text-xs font-medium cursor-pointer min-h-11 shrink-0"
                            >
                              <PlayCircle className="w-4 h-4" aria-hidden="true" />
                              Dodaj prace
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop: Table view */}
              <div className="hidden lg:block bg-[#131B2E] border border-slate-800/60 rounded-2xl overflow-x-auto">
                <table className="w-full min-w-[980px]">
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
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Akcje
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filtered.map((session) => {
                      const className = classNames[session.class_id] ?? '—';
                      const note = attendanceNote(session);

                      return (
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
                                {[
                                  session.answer_key_subject,
                                  formatDate(session.created_at),
                                  shortId(session.id),
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center justify-center h-10 px-3 bg-blue-500/20 text-blue-400 rounded-xl font-semibold text-sm max-w-[14ch] truncate">
                              {className}
                            </span>
                            {(session.session_groups?.length ?? 0) > 0 && (
                              <div className="mt-1.5">
                                <GroupsBadge session={session} />
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-slate-100 tabular-nums">{session.works_count}</p>
                            <p className="text-xs text-slate-400 tabular-nums">
                              {session.graded_count}/{session.works_count} sprawdzonych
                            </p>
                            {note && (
                              <p className="text-xs text-amber-400 tabular-nums mt-1">{note}</p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge session={session} />
                          </td>
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
                                    className={`h-full rounded-full transition-all ${confidenceBarColor(
                                      session.avg_confidence
                                    )}`}
                                    style={{ width: `${session.avg_confidence}%` }}
                                  ></div>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {canOpenQueue(session) ? (
                              <button
                                type="button"
                                title="Wybierz nieobecnych lub uczniów bez pracy i dodaj ich prace"
                                aria-label={`Dodaj prace w sesji ${titleFor(session)}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openQueue(session);
                                }}
                                onKeyDown={(event) => event.stopPropagation()}
                                className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors text-xs font-medium cursor-pointer min-h-11 whitespace-nowrap"
                              >
                                <PlayCircle className="w-4 h-4" aria-hidden="true" />
                                Dodaj prace
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="flex justify-center mt-4 sm:mt-6">
                  <button
                    onClick={() => loadSessions(sessions.length)}
                    disabled={isLoadingMore}
                    className="px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium rounded-lg transition-colors text-sm cursor-pointer min-h-11 disabled:opacity-50"
                  >
                    {isLoadingMore ? 'Ładowanie…' : `Pokaż wcześniejsze (${totalCount - sessions.length})`}
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
