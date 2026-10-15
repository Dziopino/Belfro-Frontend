import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { classesAPI } from '../services/apiService';
import { encryptData, decryptData } from '../services/cryptoService';
import { apiErrorMessage } from '../utils/apiError';
import { useAuth } from '../contexts/AuthContext';
import type { Class } from '../types';
import Sidebar from '../components/Sidebar';
import HeaderAccount from '../components/HeaderAccount';
import { Search, Bell, Plus, Users, Hash, Trash2, X, ArrowRight } from 'lucide-react';

/** Górny sufit listy — musi zgadzać się z MAX_ROSTER_SIZE (backend/src/utils/roster.ts:19). */
const MAX_ROSTER_SIZE = 100;

/** Polska odmiana: 1 uczeń, dalej uczniów (łącznie z 11, 12... 21 nie po polsku). */
function studentsWord(count: number): string {
  return count === 1 ? 'uczeń' : 'uczniów';
}

export default function ClassesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Konto prywatne nie ma umowy powierzenia danych, więc jego klasy są wyłącznie listą numerów.
  const numberedAccount = user?.account_kind === 'private';

  const [classes, setClasses] = useState<Class[]>([]);
  const [decryptedNames, setDecryptedNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [studentCount, setStudentCount] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  // Dwustopniowe potwierdzenie usunięcia w miejscu okna dialogowego przeglądarki —
  // natywny confirm() nie mieści polskiego wyjaśnienia, że lecą też prace z historii.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Pobierz klasy przy ładowaniu
  useEffect(() => {
    loadClasses();
  }, []);

  const loadClasses = async () => {
    try {
      // Szkielety tylko przy pierwszym ładowaniu — odświeżenie po dodaniu/usunięciu klasy
      // nie może zamienić gotowej listy na migoczące placeholdery.
      if (classes.length === 0) setIsLoading(true);
      setError('');
      const { classes: fetchedClasses } = await classesAPI.getClasses();
      setClasses(fetchedClasses);

      // Odszyfruj nazwy klas w locie
      const decrypted: Record<string, string> = {};
      for (const cls of fetchedClasses) {
        try {
          decrypted[cls.id] = await decryptData(cls.encrypted_name);
        } catch (err) {
          console.error(`Nie udało się odszyfrować nazwy klasy ${cls.id}:`, err);
          decrypted[cls.id] = 'Nie udało się wczytać nazwy';
        }
      }
      setDecryptedNames(decrypted);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się załadować klas'));
    } finally {
      setIsLoading(false);
    }
  };

  const closeCreateForm = () => {
    setShowCreateForm(false);
    setNewClassName('');
    setStudentCount('');
    setConfirmDeleteId(null);
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newClassName.trim()) {
      setError('Podaj nazwę klasy');
      return;
    }

    const count = Number(studentCount);
    if (numberedAccount && (!Number.isInteger(count) || count < 1 || count > MAX_ROSTER_SIZE)) {
      setError(`Podaj liczbę uczniów — całą liczbę od 1 do ${MAX_ROSTER_SIZE}.`);
      return;
    }

    try {
      setIsCreating(true);

      // KLUCZOWY MOMENT E2E: Szyfruj nazwę klasy PRZED wysłaniem do serwera
      const encryptedName = await encryptData(newClassName.trim());

      // Liczbę uczniów przyjmie tylko konto prywatne; serwer i tak sam wyznacza tryb listy.
      await classesAPI.createClass(
        numberedAccount ? { encrypted_name: encryptedName, student_count: count } : { encrypted_name: encryptedName }
      );

      // Odśwież listę klas
      await loadClasses();

      closeCreateForm();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się utworzyć klasy'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteClass = async (classId: string) => {
    try {
      setError('');
      await classesAPI.deleteClass(classId);
      setConfirmDeleteId(null);
      await loadClasses();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się usunąć klasy'));
    }
  };

  const needle = query.trim().toLowerCase();
  const visibleClasses =
    needle.length === 0
      ? classes
      : classes.filter((cls) => (decryptedNames[cls.id] ?? '').toLowerCase().includes(needle));

  // Pusta kratka to Number('') === 0, więc pokaże podpowiedź zamiast obietnicy „nr 1–0”.
  const rosterCount = Number(studentCount);
  const rosterCountValid = Number.isInteger(rosterCount) && rosterCount >= 1 && rosterCount <= MAX_ROSTER_SIZE;

  return (
    <div className="flex min-h-screen bg-[#0B0F19]">
      <Sidebar />

      <div className="flex-1 w-full lg:ml-64">
        {/* Header */}
        <header className="h-14 sm:h-16 bg-[#131B2E] border-b border-slate-800/60 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-10">
          {/* Left side - Mobile: rezerwujemy miejsce na hamburger, który jest fixed top-3 left-4 */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="lg:hidden flex items-center gap-3 pl-12">
              <div className="font-bold text-slate-100 text-sm leading-none">BELFRO.PL</div>
            </div>
          </div>

          {/* Right side */}
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

        {/* Main Content */}
        <main id="main-content" tabIndex={-1} className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 mx-auto w-full max-w-6xl">
          {/* Page Title + CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Zarządzanie klasami</h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Dodawaj klasy i organizuj uczniów
              </p>
            </div>

            {!showCreateForm && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors cursor-pointer min-h-11 font-medium"
              >
                <Plus className="w-5 h-5" aria-hidden="true" />
                Dodaj nową klasę
              </button>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-4" role="alert">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}

          {/* Search */}
          {!isLoading && classes.length > 0 && (
            <div>
              <label htmlFor="class-search" className="sr-only">
                Szukaj klasy
              </label>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="class-search"
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base"
                  placeholder="Szukaj klasy"
                />
              </div>
            </div>
          )}

          {/* Create Form */}
          {showCreateForm && (
            <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6 w-full">
              <div className="flex items-start justify-between gap-3 mb-4">
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 min-w-0 break-words">
                  Utwórz nową klasę
                </h2>
                <button
                  type="button"
                  onClick={closeCreateForm}
                  className="shrink-0 -mt-2 -mr-2 p-2 rounded-xl hover:bg-slate-800/60 transition-colors cursor-pointer min-h-11 min-w-11 flex items-center justify-center"
                  title="Zamknij"
                  aria-label="Zamknij formularz"
                >
                  <X className="w-5 h-5 text-slate-400" aria-hidden="true" />
                </button>
              </div>

              <form onSubmit={handleCreateClass}>
                <label htmlFor="new-class-name" className="block text-sm font-medium text-slate-300 mb-2">
                  Nazwa klasy
                </label>
                <input
                  id="new-class-name"
                  type="text"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="np. Klasa 3A"
                  className="w-full max-w-xl px-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base"
                  disabled={isCreating}
                  required
                />
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Nazwę szyfrujemy w Twojej przeglądarce — serwer przechowuje tylko zaszyfrowany tekst.
                </p>

                {numberedAccount && (
                  <div className="mt-5 max-w-xl">
                    <label htmlFor="new-class-count" className="block text-sm font-medium text-slate-300 mb-2">
                      Liczba uczniów w klasie
                    </label>
                    <input
                      id="new-class-count"
                      type="number"
                      min={1}
                      max={MAX_ROSTER_SIZE}
                      step={1}
                      inputMode="numeric"
                      value={studentCount}
                      onChange={(e) => setStudentCount(e.target.value)}
                      placeholder="np. 30"
                      className="w-full px-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base"
                      disabled={isCreating}
                      required
                    />

                    {rosterCountValid ? (
                      <p className="mt-3 inline-flex items-start gap-2 text-sm text-slate-300">
                        <Hash className="w-4 h-4 mt-0.5 shrink-0 text-blue-400" aria-hidden="true" />
                        <span>
                          Utworzę {rosterCount} {studentsWord(rosterCount)}: nr 1–{rosterCount}.
                        </span>
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-slate-400">
                        Podaj liczbę uczniów, a system założy ich listę od numeru 1.
                      </p>
                    )}

                    <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                      To konto nie przechowuje imion i nazwisk uczniów — w bazie jest tylko numer z dziennika,
                      a pracą ucznia rozporządza ten numer.
                    </p>
                  </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 sm:justify-end mt-5">
                  <button
                    type="button"
                    onClick={closeCreateForm}
                    className="inline-flex items-center justify-center px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer min-h-11 disabled:opacity-50 font-medium"
                    disabled={isCreating}
                  >
                    Anuluj
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-50 cursor-pointer min-h-11 font-medium"
                  >
                    <Plus className="w-5 h-5" aria-hidden="true" />
                    {isCreating ? 'Tworzenie…' : 'Utwórz klasę'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5 animate-pulse motion-reduce:animate-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 shrink-0 rounded-xl bg-slate-800/70" />
                    <div className="flex-1">
                      <div className="h-4 w-2/3 rounded bg-slate-800" />
                      <div className="mt-2 h-3 w-1/3 rounded bg-slate-800/70" />
                    </div>
                  </div>
                  <div className="mt-4 h-6 w-24 rounded-lg bg-slate-800/60" />
                  <div className="mt-4 h-10 rounded-xl bg-slate-800/50" />
                </div>
              ))}
              <p className="sr-only">Ładowanie klas</p>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && classes.length === 0 && !showCreateForm && (
            <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-8 sm:p-12 text-center">
              <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7 text-blue-400" aria-hidden="true" />
              </div>
              <h2 className="text-base sm:text-lg font-semibold text-slate-100">
                Nie masz jeszcze żadnej klasy
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
                Każdą sesję sprawdzania przypisujesz do klasy, więc bez niej nie wrzucisz prac uczniów.{' '}
                {numberedAccount
                  ? 'Załóż klasę podając ich liczbę — wszyscy dostaną numery z dziennika, bez imion i nazwisk.'
                  : 'Załóż klasę raz — potem tylko dopisujesz do niej osoby.'}
              </p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="mt-6 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors cursor-pointer min-h-11 font-medium"
              >
                <Plus className="w-5 h-5" aria-hidden="true" />
                Dodaj pierwszą klasę
              </button>
            </div>
          )}

          {/* Brak trafień w wyszukiwaniu */}
          {!isLoading && classes.length > 0 && visibleClasses.length === 0 && (
            <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-8 sm:p-12 text-center">
              <div className="w-14 h-14 bg-slate-800/60 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Search className="w-7 h-7 text-slate-400" aria-hidden="true" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-slate-100 mb-2 break-words">
                Żadna klasa nie pasuje do „{query.trim()}”
              </h3>
              <p className="text-sm sm:text-base text-slate-400">
                Sprawdź pisownię albo wyczyść wyszukiwanie.
              </p>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer min-h-11 text-sm font-medium"
              >
                Wyczyść wyszukiwanie
              </button>
            </div>
          )}

          {/* Classes List */}
          {!isLoading && visibleClasses.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              {visibleClasses.map((cls) => {
                const studentCount = cls._count?.students ?? 0;

                return (
                  <article
                    key={cls.id}
                    className="flex h-full flex-col bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5 transition-colors hover:border-slate-700/70"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 bg-blue-500/20 rounded-xl flex items-center justify-center">
                          <Users className="w-5 h-5 text-blue-400" aria-hidden="true" />
                        </div>
                        <h3 className="min-w-0 text-base font-semibold text-slate-100 break-words">
                          {decryptedNames[cls.id] || '…'}
                        </h3>
                      </div>
                      <button
                        onClick={() => setConfirmDeleteId(cls.id)}
                        className="shrink-0 -mt-1.5 -mr-1.5 p-2 rounded-xl hover:bg-rose-500/20 transition-colors cursor-pointer min-h-11 min-w-11 flex items-center justify-center"
                        title={`Usuń klasę ${decryptedNames[cls.id] ?? ''}`}
                        aria-label={`Usuń klasę ${decryptedNames[cls.id] ?? ''}`}
                      >
                        <Trash2 className="w-5 h-5 text-rose-400" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center rounded-lg bg-slate-800/60 px-2 py-1 text-xs font-medium text-slate-300">
                        <span className="tabular-nums">
                          {studentCount} {studentsWord(studentCount)}
                        </span>
                      </span>
                    </div>

                    <div className="mt-auto pt-4">
                      <p className="text-xs text-slate-400 tabular-nums">
                        Utworzono: <time dateTime={cls.created_at}>{new Date(cls.created_at).toLocaleDateString('pl-PL')}</time>
                      </p>

                      <button
                        onClick={() => navigate(`/classes/${cls.id}`)}
                        className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors cursor-pointer min-h-11"
                      >
                        Zarządzaj uczniami
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </button>

                      {confirmDeleteId === cls.id && (
                        <div className="mt-3 p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl">
                          <p className="text-sm text-rose-200">
                            Usunąć klasę {decryptedNames[cls.id]}? Zniknie też {studentCount}{' '}
                            {studentsWord(studentCount)} i cała historia sprawdzania prac tej klasy.
                            Tej operacji nie da się cofnąć.
                          </p>
                          <div className="mt-3 flex gap-2 justify-end">
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg transition-colors text-sm cursor-pointer min-h-11"
                            >
                              Anuluj
                            </button>
                            <button
                              onClick={() => handleDeleteClass(cls.id)}
                              className="px-3 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-sm cursor-pointer min-h-11 font-medium"
                            >
                              Tak, usuń
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
