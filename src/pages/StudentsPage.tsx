import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { classesAPI, studentsAPI } from '../services/apiService';
import { encryptData, decryptData } from '../services/cryptoService';
import { useDecryptedStudents } from '../hooks/useDecryptedStudents';
import Sidebar from '../components/Sidebar';
import HeaderAccount from '../components/HeaderAccount';
import { Search, Bell, Plus, UserPlus, Trash2, PlayCircle, ArrowLeft } from 'lucide-react';
import { apiErrorMessage } from '../utils/apiError';
import type { RosterMode, Student } from '../types';

// "07", " 7" i "7" to ten sam uczeń — normalizujemy przed zapisem, żeby
// sprawdzenie duplikatu i dane w bazie były spójne.
function normalizeStudentNumber(raw: string): string {
  return raw.trim().replace(/^0+(?=\d)/, '');
}

export default function StudentsPage() {
  const navigate = useNavigate();
  const { classId } = useParams<{ classId: string }>();

  const [className, setClassName] = useState('');
  const [rosterMode, setRosterMode] = useState<RosterMode>('named');
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [appendCount, setAppendCount] = useState('1');

  // Etykiety uczniów liczy hook na wspólnej tożsamości — strona nie dotyka deszyfratora.
  const { decryptedStudents, isDecrypting, error: decryptError } = useDecryptedStudents(students);
  const numbered = rosterMode === 'numbered';

  useEffect(() => {
    if (classId) {
      loadClassAndStudents();
    }
  }, [classId]);

  const loadClassAndStudents = async () => {
    if (!classId) return;

    try {
      setIsLoading(true);
      setError('');

      // Pobierz dane klasy
      const { class: fetchedClass } = await classesAPI.getClass(classId);

      setRosterMode(fetchedClass.roster_mode);

      // Odszyfruj nazwę klasy
      try {
        const decryptedName = await decryptData(fetchedClass.encrypted_name);
        setClassName(decryptedName);
      } catch (err) {
        console.error(`Nie udało się odszyfrować nazwy klasy ${classId}:`, err);
        setClassName('Nie udało się wczytać nazwy');
      }

      const { students: fetchedStudents } = await studentsAPI.getStudents(classId);
      setStudents(fetchedStudents);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się załadować danych'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!classId) return;

    if (numbered) {
      await handleAppendStudents();
      return;
    }

    if (!firstName.trim() || !lastName.trim() || !studentNumber.trim()) {
      setError('Wszystkie pola są wymagane');
      return;
    }

    const normalizedNumber = normalizeStudentNumber(studentNumber);

    if (!/^\d+$/.test(normalizedNumber)) {
      setError('Numer z dziennika może zawierać tylko cyfry, np. 7');
      return;
    }

    // Szyfrowanie ma losowe IV, więc baza nie wykryje powtórki — jedyna realna
    // kontrola jest tutaj, na już odszyfrowanej liście tej klasy.
    const conflict = decryptedStudents.find(
      (s) => normalizeStudentNumber(s.number) === normalizedNumber
    );
    if (conflict) {
      setError(
        `Numer ${normalizedNumber} jest już w tej klasie: ${conflict.label}. Nadaj uczniowi inny numer.`
      );
      return;
    }

    try {
      setIsAdding(true);

      // KLUCZOWY MOMENT E2E: Szyfruj WSZYSTKIE dane osobowe PRZED wysłaniem
      const encryptedFirstName = await encryptData(firstName.trim());
      const encryptedLastName = await encryptData(lastName.trim());
      const encryptedNumber = await encryptData(normalizedNumber);

      // Wyślij zaszyfrowane dane do backendu
      await studentsAPI.createStudent(classId, {
        encrypted_first_name: encryptedFirstName,
        encrypted_last_name: encryptedLastName,
        encrypted_number: encryptedNumber,
      });

      await loadClassAndStudents();

      // Reset formularza
      setFirstName('');
      setLastName('');
      setStudentNumber('');
      setShowAddForm(false);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się dodać ucznia'));
    } finally {
      setIsAdding(false);
    }
  };

  /**
   * Klasa numerowana: nauczyciel podaje tylko, ilu uczniów doszło. Numery nadaje serwer od
   * najwyższego zajętego, więc nie ma tu pola, które można by sobie pomylić.
   */
  const handleAppendStudents = async () => {
    if (!classId) return;

    const count = Number(appendCount);
    if (!Number.isInteger(count) || count < 1) {
      setError('Podaj liczbę uczniów — całą liczbę od 1 w górę.');
      return;
    }

    try {
      setIsAdding(true);
      await studentsAPI.appendStudents(classId, { student_count: count });
      setAppendCount('1');
      setShowAddForm(false);
      await loadClassAndStudents();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się dodać uczniów'));
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteStudent = async (studentId: string, identity: string) => {
    if (!confirm(`Czy na pewno chcesz usunąć ucznia "${identity}"?`)) {
      return;
    }

    try {
      await studentsAPI.deleteStudent(studentId);
      await loadClassAndStudents();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się usunąć ucznia'));
    }
  };

  if (isLoading || isDecrypting) {
    return (
      <div className="flex min-h-screen bg-[#0B0F19]">
        <Sidebar />
        <div className="flex-1 w-full lg:ml-64 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin motion-reduce:animate-none rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-slate-400">Ładowanie uczniów…</p>
          </div>
        </div>
      </div>
    );
  }

  const needle = query.trim().toLowerCase();
  const searchHelp = numbered
    ? 'Szukaj po numerze z dziennika'
    : 'Szukaj po imieniu, nazwisku lub numerze';
  const visibleStudents =
    needle.length === 0
      ? decryptedStudents
      : decryptedStudents.filter((student) =>
          `${student.label} ${student.number}`.toLowerCase().includes(needle)
        );

  return (
    <div className="flex min-h-screen bg-[#0B0F19]">
      <Sidebar />

      <div className="flex-1 w-full lg:ml-64">
        {/* Header */}
        <header className="h-14 sm:h-16 bg-[#131B2E] border-b border-slate-800/60 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-10">
          {/* Left side */}
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            {/* Mobile: rezerwujemy miejsce na hamburger, który jest fixed top-3 left-4 */}
            <div className="lg:hidden w-12 shrink-0"></div>

            <button
              onClick={() => navigate('/classes')}
              title="Powrót"
              aria-label="Powrót"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium rounded-xl transition-colors text-xs whitespace-nowrap cursor-pointer min-h-11"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Powrót</span>
            </button>

            <div className="hidden sm:block border-l border-slate-800/60 pl-4 min-w-0">
              <h1 className="text-lg font-bold text-slate-100 truncate">{className}</h1>
              <p className="text-xs text-slate-400 truncate">Liczba uczniów: {students.length}</p>
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
        <main id="main-content" tabIndex={-1} className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
          {/* Na urządzeniach mobilnych nazwa klasy nie mieści się w headerze, więc jest tutaj */}
          <div className="sm:hidden min-w-0">
            <h1 className="text-base font-bold text-slate-100">{className}</h1>
            <p className="text-xs text-slate-400 mt-0.5">Liczba uczniów: {students.length}</p>
          </div>

          {/* Error Message */}
          {(error || decryptError) && (
            <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-4" role="alert">
              {error && <p className="text-sm text-rose-400">{error}</p>}
              {decryptError && (
                <p className={`text-sm text-rose-400${error ? ' mt-2' : ''}`}>{decryptError}</p>
              )}
            </div>
          )}

          {/* Search */}
          {students.length > 0 && (
            <div>
              <label htmlFor="student-search" className="sr-only">
                {searchHelp}
              </label>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="student-search"
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base"
                  placeholder={searchHelp}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            {!showAddForm ? (
              <>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors cursor-pointer"
                >
                  <Plus className="w-5 h-5" aria-hidden="true" />
                  {numbered ? 'Dodaj uczniów' : 'Dodaj ucznia'}
                </button>
                {students.length > 0 && (
                  <button
                    onClick={() => navigate(`/grading/${classId}`)}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-colors cursor-pointer"
                  >
                    <PlayCircle className="w-5 h-5" aria-hidden="true" />
                    Rozpocznij sprawdzanie
                  </button>
                )}
              </>
            ) : (
              <form onSubmit={handleAddStudent} className="w-full bg-[#131B2E] border border-slate-800/60 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-slate-100 mb-4">
                  {numbered ? 'Dodaj brakujących uczniów' : 'Dodaj nowego ucznia'}
                </h3>

                {numbered ? (
                  <>
                    <div className="md:max-w-xs">
                      <label htmlFor="append-count" className="block text-sm font-medium text-slate-300 mb-2">
                        Ilu uczniów dodać
                      </label>
                      <input
                        id="append-count"
                        type="number"
                        min={1}
                        max={100}
                        value={appendCount}
                        onChange={(e) => setAppendCount(e.target.value)}
                        className="w-full px-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        disabled={isAdding}
                      />
                    </div>
                    <p className="mt-3 text-sm text-slate-400">
                      Numery dostanie każdy nowy uczeń, licząc od najwyższego zajętego w tej klasie.
                    </p>
                  </>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label htmlFor="new-student-first-name" className="block text-sm font-medium text-slate-300 mb-2">
                        Imię
                      </label>
                      <input
                        id="new-student-first-name"
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Jan"
                        className="w-full px-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        disabled={isAdding}
                      />
                    </div>
                    <div>
                      <label htmlFor="new-student-last-name" className="block text-sm font-medium text-slate-300 mb-2">
                        Nazwisko
                      </label>
                      <input
                        id="new-student-last-name"
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Kowalski"
                        className="w-full px-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        disabled={isAdding}
                      />
                    </div>
                    <div>
                      <label htmlFor="new-student-number" className="block text-sm font-medium text-slate-300 mb-2">
                        Numer z dziennika
                      </label>
                      <input
                        id="new-student-number"
                        type="text"
                        inputMode="numeric"
                        value={studentNumber}
                        onChange={(e) => setStudentNumber(e.target.value)}
                        placeholder="1"
                        className="w-full px-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        disabled={isAdding}
                      />
                    </div>
                  </div>
                )}
                <div className="mt-4 flex gap-4">
                  <button
                    type="submit"
                    disabled={isAdding}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" aria-hidden="true" />
                    {isAdding ? 'Dodawanie…' : numbered ? 'Dodaj uczniów' : 'Dodaj ucznia'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setFirstName('');
                      setLastName('');
                      setStudentNumber('');
                      setAppendCount('1');
                      setError('');
                    }}
                    className="px-6 py-2.5 bg-slate-700/50 hover:bg-slate-700 text-slate-200 font-medium rounded-xl transition-colors cursor-pointer"
                  >
                    Anuluj
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Students List */}
          {students.length === 0 ? (
            <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-12 text-center">
              <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <UserPlus className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-100 mb-2">
                Brak uczniów
              </h3>
              <p className="text-slate-400">
                {numbered
                  ? `Dodaj uczniów do klasy „${className}” — system nadaje im kolejne numery.`
                  : `Dodaj pierwszego ucznia do klasy „${className}”.`}
              </p>
            </div>
          ) : visibleStudents.length === 0 ? (
            <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-8 sm:p-12 text-center">
              <div className="w-14 h-14 bg-slate-800/60 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Search className="w-7 h-7 text-slate-400" aria-hidden="true" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-slate-100 mb-2 break-words">
                Żaden uczeń nie pasuje do „{query.trim()}”
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
          ) : (
            <div className="w-full overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
              <div
                className={`bg-[#131B2E] border border-slate-800/60 rounded-2xl overflow-hidden ${
                  numbered ? 'sm:min-w-[480px]' : 'min-w-[640px]'
                }`}
              >
                <table className="w-full">
                  <thead className="bg-slate-900/50 border-b border-slate-800/60">
                    <tr>
                      {numbered ? (
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Uczeń
                        </th>
                      ) : (
                        <>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                            Nr
                          </th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                            Imię
                          </th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                            Nazwisko
                          </th>
                        </>
                      )}
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Dodano
                      </th>
                      <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Akcje
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {visibleStudents.map((student) => (
                      <tr key={student.id} className="hover:bg-slate-800/20 transition-colors">
                        {numbered ? (
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-100">
                            {student.label}
                          </td>
                        ) : (
                          <>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-100">
                              {student.number}
                            </td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-slate-100">
                              {student.firstName}
                            </td>
                            <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-slate-100">
                              {student.lastName}
                            </td>
                          </>
                        )}
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                          <time dateTime={student.created_at}>{new Date(student.created_at).toLocaleDateString('pl-PL')}</time>
                        </td>
                        <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleDeleteStudent(student.id, student.label)}
                            className="p-2 hover:bg-rose-500/20 rounded-lg text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Usuń ucznia"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
