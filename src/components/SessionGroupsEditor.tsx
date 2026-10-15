import { useMemo, useState } from 'react';
import { useDecryptedStudents } from '../hooks/useDecryptedStudents';
import { gradingAPI } from '../services/apiService';
import { pluralPolish } from '../utils/polish';
import { StudentChecklistSkeleton } from './StudentSearchChecklist';
import type { AnswerKeyGroupView, CreateSessionGroupRequest, Student } from '../types';
import { ChevronLeft, Copy, Search, Shuffle, Users, X } from 'lucide-react';

interface SessionGroupsEditorProps {
  students: Student[];
  /** Grupy przepisane z klucza odpowiedzi: na tym ekranie tylko się je odczytuje */
  keyGroups: AnswerKeyGroupView[];
  /** Nieobecni z listy obecności — na tym ekranie ich nie ma: przydzielamy tylko tych, którzy piszą */
  absentIds: string[];
  /**
   * Skład grup już zapisany w sesji, w tej samej kolejności co `keyGroups`. Jego obecność przełącza
   * ekran w tryb uzupełnienia: na wykazie zostają wyłącznie uczniowie bez przydziału (odznaczeni z
   * nieobecności), a zapis dokłada ich do istniejących grup zamiast przepisywać przydział od nowa.
   */
  existingMembers?: string[][];
  isSubmitting: boolean;
  onBack: () => void;
  onConfirm: (groups: CreateSessionGroupRequest[]) => void;
}

function groupsWord(count: number): string {
  return pluralPolish(count, 'grupa', 'grupy', 'grup');
}

function studentsWord(count: number): string {
  return pluralPolish(count, 'uczeń', 'uczniów', 'uczniów');
}

function worksWord(count: number): string {
  return pluralPolish(count, 'praca', 'prace', 'prac');
}

/**
 * Przydział klasy do grup klucza odpowiedzi — krok po liście obecności, więc na wykazie zostają tylko
 * ci, którzy dziś piszą. Nieobecnych nie ma tu w ogóle: klikanie w nich grupy nie ma sensu, a kiedy
 * napiszą sprawdzian w innym terminie, odznaczymy ich z nieobecności tej samej sesji i wpadną na ten
 * wykaz jako uczniowie bez przydziału.
 *
 * Ekran zna dwa tryby. Nowa sesja (`existingMembers` pominięte) przepisuje przydział całej klasy od
 * zera i startuje z pierwszą grupą, bo przy 30 nazwiskach przeniesienie kilkunastu osób do B jest
 * krótsze niż klikanie każdej z nich. Wznowiona sesja (`existingMembers` przepisane z jej wierszy)
 * pokazuje wyłącznie tych, którzy wciąż są bez grupy, i startuje z pustym przydziałem: to nauczyciel
 * ma zdecydować, jaki wariant dostaną, a nie domyślnie pierwsza grupa z bazy.
 *
 * Grup się tu nie tworzy ani nie rename'uje: wariant arkusza (nazwa, zadania, suma punktów) definiuje
 * się w kluczu odpowiedzi, a sesja mrozi go po stronie serwera. Jedyne, co nauczyciel wybiera, to w
 * której grupie siedzi uczeń — stąd brak edytorów klucza i nazw w tym widoku.
 *
 * Przydział jest jeden wspólny wykaz, nie osobne listy na grupę: widać od razu, kto nie trafił nigdzie,
 * a kliknięcie w inną literę przesuwa ucznia zamiast go duplikować. Backend i tak wymaga list
 * rozłącznych, więc interfejs nie pozwala zrobić tego, co dostałoby 400.
 */
export default function SessionGroupsEditor({
  students,
  keyGroups,
  absentIds,
  existingMembers,
  isSubmitting,
  onBack,
  onConfirm,
}: SessionGroupsEditorProps) {
  const isFillMode = existingMembers !== undefined;
  const alreadyAssignedIds = useMemo(() => new Set((existingMembers ?? []).flat()), [existingMembers]);

  const writingStudents = useMemo(() => {
    const absent = new Set(absentIds);
    return students.filter(
      (student) => !absent.has(student.id) && !alreadyAssignedIds.has(student.id)
    );
  }, [students, absentIds, alreadyAssignedIds]);
  // W trybie uzupełnienia wykaz to tylko uczniowie bez przydziału, więc licznik nieobecności
  // z całej klasy nie ma tu czego pokazywać.
  const absentCount = isFillMode ? 0 : students.length - writingStudents.length;

  const { decryptedStudents, isDecrypting, error: decryptError } = useDecryptedStudents(writingStudents);

  // student id -> indeks grupy z klucza. Startujemy od pierwszej grupy: przy 30 nazwiskach
  // przepisanie kilkunastu osób do B jest krótsze niż kliknięcie każdej z nich. W uzupełnieniu
  // start jest pusty — bez klikniętej grupy uczeń nie wejdzie do zapisu.
  const [assignment, setAssignment] = useState<Record<string, number>>(() =>
    isFillMode ? {} : Object.fromEntries(writingStudents.map((student) => [student.id, 0]))
  );
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isCopying, setIsCopying] = useState(false);

  const assignedCount = useMemo(
    () => writingStudents.filter((student) => assignment[student.id] !== undefined).length,
    [writingStudents, assignment]
  );
  const unassignedCount = writingStudents.length - assignedCount;

  // Członkowie grupy w żądaniu: to, co sesja już ma, plus uczniowie przypisani na tym ekranie.
  // Bez pierwszego członu zapis nadpisałby grupy tylko nowo dopisanymi nazwiskami.
  const memberIdsOf = (groupIndex: number): string[] => [
    ...(existingMembers?.[groupIndex] ?? []),
    ...writingStudents.filter((student) => assignment[student.id] === groupIndex).map((student) => student.id),
  ];

  // Licznik bez memoizacji: `memberIdsOf` jest domknięciem na `assignment`, więc każdy `useMemo`
  // używający tej funkcji musiałby albo zgadywać zależności, albo udawać, że ich nie potrzebuje.
  // Przy trzydziestu nazwiskach i trzech grupach to praca na ułamek milisekundy na render.
  const groupCounts = keyGroups.map((_, index) => memberIdsOf(index).length);
  const emptyGroupNames = keyGroups
    .filter((_, index) => groupCounts[index] === 0)
    .map((group) => group.name.trim());

  // Grupa bez uczniów nadal wchodzi do sesji — jej wiersz to jedyny sposób, żeby arkusz napisany
  // w innym terminie było czym sprawdzić. Kopia musi to mówić wprost, bo licznik „0 osób” przy
  // nazwie wygląda na błąd przydziału, a nie na wariant, który po prostu czeka.
  const emptyGroupList = emptyGroupNames.join(', ');
  const emptyGroupNote =
    emptyGroupNames.length === 0
      ? ''
      : isFillMode
        ? emptyGroupNames.length === 1
          ? `Grupa ${emptyGroupList} nadal jest bez uczniów — jej wariant zostaje w tej sesji.`
          : `Grupy ${emptyGroupList} nadal są bez uczniów — ich warianty zostają w tej sesji.`
        : emptyGroupNames.length === 1
          ? `Grupa ${emptyGroupList} wchodzi do sesji bez uczniów. Kto napisze ten arkusz w innym terminie, dostanie jej wariant przy wznowieniu.`
          : `Grupy ${emptyGroupList} wchodzą do sesji bez uczniów. Kto napisze któryś z tych arkuszy w innym terminie, dostanie jego wariant przy wznowieniu.`;

  // Kliknięcie w literę, do której uczeń już należy, zdejmuje go z podziału — to jedyny sposób,
  // by wycofać pomyłkowy przydział bez przenoszenia go do innej grupy.
  const assign = (studentId: string, groupIndex: number) => {
    setAssignment((prev) => {
      const next = { ...prev };
      if (next[studentId] === groupIndex) delete next[studentId];
      else next[studentId] = groupIndex;
      return next;
    });
    setInfo('');
  };

  const assignMany = (studentIds: string[], groupIndex: number | null) => {
    setAssignment((prev) => {
      const next = { ...prev };
      for (const studentId of studentIds) {
        if (groupIndex === null) delete next[studentId];
        else next[studentId] = groupIndex;
      }
      return next;
    });
    setInfo('');
  };

  const shuffleSplit = () => {
    // Losowanie bez pomijania kogokolwiek z dzisiejszej listy: tasujemy piszących i rozdajemy
    // naprzemiennie, więc przy 26 osobach i 3 grupach wyjdzie 9 / 9 / 8, a nie losowe kupy.
    const ids = writingStudents.map((student) => student.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }

    const next: Record<string, number> = {};
    ids.forEach((id, index) => {
      next[id] = index % keyGroups.length;
    });

    setAssignment(next);
    setInfo(
      isFillMode
        ? `Między grupy rozlosowano ${ids.length} ${studentsWord(ids.length)}. Sprawdź, czy wariant każdej z nich jej odpowiada.`
        : 'Wszyscy piszący rozlosowani między grupy. Sprawdź, czy wariant każdej z nich jej odpowiada.'
    );
    setError('');
  };

  // Szukamy sesji grupowej wśród ostatnich, a nie pierwszej lepszej: historyczna lista jest posortowana
  // od najnowszej, więc to najprawdopodobniej ten sam zestaw kart co dziś.
  const copyFromLastSession = async () => {
    try {
      setIsCopying(true);
      setError('');
      setInfo('');

      const { sessions } = await gradingAPI.getSessions({ limit: 30 });
      const template = sessions.find((session) => (session.session_groups?.length ?? 0) > 0);

      if (!template) {
        setError('Żadna z ostatnich sesji nie miała podziału na grupy. Przypisz uczniów ręcznie albo użyj losowania.');
        return;
      }

      const { session } = await gradingAPI.getSession(template.id);
      const currentIds = new Set(writingStudents.map((student) => student.id));
      const indexByName = new Map(
        keyGroups.map((group, index) => [group.name.trim().toLocaleLowerCase(), index] as const)
      );

      const copied: Record<string, number> = {};
      for (const group of session.session_groups ?? []) {
        const groupIndex = indexByName.get(group.name.trim().toLocaleLowerCase());
        // Grupa z tamtej sesji, której nazwy nie ma w tym kluczu, nie ma do czego przydzielać — pomijamy ją.
        if (groupIndex === undefined) continue;
        for (const studentId of group.student_ids) {
          if (currentIds.has(studentId)) copied[studentId] = groupIndex;
        }
      }

      const copiedCount = Object.keys(copied).length;
      if (copiedCount === 0) {
        setError(
          `Sesja „${template.name ?? template.answer_key_name ?? 'bez nazwy'}” ma grupy, ale żadnego ucznia z tej klasy w ich składzie.`
        );
        return;
      }

      setAssignment(copied);
      const skipped = writingStudents.length - copiedCount;
      setInfo(
        `Przepisany podział z sesji „${template.name ?? 'bez nazwy'}”. ` +
          (skipped > 0
            ? `${skipped} ${studentsWord(skipped)} nie było w tamtej sesji — przypisz ich ręcznie. `
            : '') +
          'Sprawdź, czy każdej grupie odpowiada jej wariant.'
      );
    } catch {
      setError('Nie udało się wczytać podziału z poprzedniej sesji.');
    } finally {
      setIsCopying(false);
    }
  };

  const needle = query.trim().toLowerCase();
  const visibleStudents =
    needle.length === 0
      ? decryptedStudents
      : decryptedStudents.filter((student) =>
          `${student.label} ${student.number}`.toLowerCase().includes(needle)
        );
  const visibleIds = visibleStudents.map((student) => student.id);

  const validate = (): string => {
    if (keyGroups.length < (isFillMode ? 1 : 2)) {
      return isFillMode
        ? 'Ta sesja nie ma grup, więc nie ma czego w niej przypisywać.'
        : 'Ten klucz nie ma grup — wybierz klucz z wariantami albo sprawdź bez podziału.';
    }

    if (unassignedCount > 0) {
      return isFillMode
        ? `${unassignedCount} ${studentsWord(unassignedCount)} bez przydzielonej grupy. Przydział zapisze się dopiero wtedy, gdy każde nazwisko będzie miało wariant.`
        : `${unassignedCount} ${studentsWord(unassignedCount)} bez przydzielonej grupy. Każdy musi trafić do jednej z nich, inaczej nie wejdzie do tej sesji.`;
    }

    return '';
  };

  const handleSubmit = () => {
    const message = validate();
    setError(message);
    if (message) return;

    const payload = keyGroups.map((group, index) => ({
      name: group.name.trim(),
      student_ids: memberIdsOf(index),
    }));

    // Żądanie niesie wszystkie grupy klucza, także te, których nikt nie tknął. Przy uzupełnieniu
    // wymaga tego serwer — odrzuca przydział, w którym brakuje którejkolwiek grupy sesji. Przy
    // tworzeniu zależy nam na wierszach: sesja mrozi każdy wariant klucza, więc arkusz C i D da się
    // sprawdzić później, gdy uczeń zdjęty z nieobecności napisze właśnie je.
    onConfirm(payload);
  };

  if (isDecrypting) {
    return <StudentChecklistSkeleton />;
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 sm:space-y-6">
      <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6">
        <div className="flex items-start gap-3 mb-1">
          <div className="w-11 h-11 shrink-0 bg-blue-500/20 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-400" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-slate-100 break-words">Przypisanie do grup</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
              {isFillMode
                ? 'Ci uczniowie nie trafili do żadnej grupy, bo byli nieobecni przy rozdawaniu wariantów. Kliknij nazwę grupy przy każdym nazwisku — pracę każdego z nich sprawdzi klucz wybranej grupy.'
                : `Klucz ma ${keyGroups.length} ${groupsWord(keyGroups.length)} — każda dostaje inny wariant arkusza, z własną sumą punktów. Kliknij nazwę grupy przy nazwisku.`}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-800/50 tabular-nums">
            przypisanych: {assignedCount} z {writingStudents.length}
          </span>
          {unassignedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium bg-amber-950/40 text-amber-400 border border-amber-800/50 tabular-nums">
              bez grupy: {unassignedCount}
            </span>
          )}
          {alreadyAssignedIds.size > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium bg-slate-800/60 text-slate-300 border border-slate-700 tabular-nums">
              w grupach: {alreadyAssignedIds.size}
            </span>
          )}
          {absentCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium bg-slate-800/60 text-slate-300 border border-slate-700 tabular-nums">
              nieobecnych: {absentCount}
            </span>
          )}
        </div>

        <ul className="mt-4 flex flex-wrap gap-2">
          {keyGroups.map((group, index) => (
            <li
              key={group.name}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/40 border border-slate-800/60 text-xs sm:text-sm tabular-nums"
            >
              <span className="font-medium text-slate-100 truncate max-w-[10rem]">{group.name}</span>
              <span className="text-slate-400">{group.total_points} pkt</span>
              <span className="text-slate-400">
                {groupCounts[index]} {pluralPolish(groupCounts[index], 'osoba', 'osoby', 'osób')}
              </span>
            </li>
          ))}
        </ul>

        {emptyGroupNote && (
          <p className="mt-3 text-xs sm:text-sm text-slate-400 leading-relaxed">{emptyGroupNote}</p>
        )}

        {isFillMode && alreadyAssignedIds.size > 0 && (
          <p className="mt-4 text-xs sm:text-sm text-slate-400 leading-relaxed">
            Skład grup tej sesji ({alreadyAssignedIds.size} {studentsWord(alreadyAssignedIds.size)}) zostaje bez
            zmian — ten wykaz tylko dopisuje brakujących. Nieobecni pojawią się na nim dopiero wtedy, gdy
            odznaczysz ich z nieobecności.
          </p>
        )}

        {!isFillMode && absentCount > 0 && (
          <p className="mt-4 text-xs sm:text-sm text-slate-400 leading-relaxed">
            Nieobecnych nie ma na tej liście i nie trafiają do żadnej grupy. Kiedy napiszą sprawdzian w innym
            terminie, odznacz ich z nieobecności tej samej sesji — wpadną wtedy na ten wykaz i dostaną wariant,
            który wskażesz.
          </p>
        )}
      </div>

      <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6">
        <div>
          <label htmlFor="group-student-search" className="sr-only">
            Szukaj po imieniu, nazwisku lub numerze w dzienniku
          </label>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="group-student-search"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full pl-10 pr-11 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base"
              placeholder="Szukaj po imieniu, nazwisku lub numerze"
            />
            {needle.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery('')}
                title="Wyczyść wyszukiwanie"
                aria-label="Wyczyść wyszukiwanie"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {visibleIds.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs sm:text-sm text-slate-400">
              {needle.length === 0 ? 'Wszystkich' : 'Widocznych'} przypisz do:
            </span>
            {keyGroups.map((group, index) => (
              <button
                key={group.name}
                type="button"
                onClick={() => assignMany(visibleIds, index)}
                title={`Przypisz ${visibleIds.length} ${studentsWord(visibleIds.length)} do grupy ${group.name}`}
                className="px-3 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs sm:text-sm font-medium transition-colors cursor-pointer min-h-11 max-w-[10rem] truncate"
              >
                {group.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => assignMany(visibleIds, null)}
              className="px-3 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs sm:text-sm font-medium transition-colors cursor-pointer min-h-11"
            >
              Usuń z grup
            </button>
          </div>
        )}

        <ul className="mt-4 divide-y divide-slate-800/60">
          {visibleStudents.map((student) => {
            const currentGroup = assignment[student.id];

            return (
              <li key={student.id} className="flex flex-wrap items-center gap-3 py-3">
                {!student.numbered && (
                  <span className="w-8 shrink-0 text-xs sm:text-sm text-slate-400 tabular-nums">
                    {student.number}
                  </span>
                )}
                <span className="flex-1 min-w-[8rem] truncate text-sm sm:text-base text-slate-100">
                  {student.label}
                </span>
                <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                  {keyGroups.map((group, index) => {
                    const isActive = currentGroup === index;
                    return (
                      <button
                        key={group.name}
                        type="button"
                        onClick={() => assign(student.id, index)}
                        aria-pressed={isActive}
                        aria-label={`${isActive ? 'Zabierz' : 'Przypisz'} ${student.label} do grupy ${group.name}`}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition-colors cursor-pointer min-h-11 max-w-[9rem] truncate tabular-nums ${
                          isActive
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {group.name}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>

        {visibleStudents.length === 0 && needle.length > 0 && (
          <p className="mt-4 text-sm text-slate-400">Żaden uczeń nie pasuje do „{query.trim()}”.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 sm:gap-3">
        <button
          type="button"
          onClick={shuffleSplit}
          disabled={keyGroups.length < 2}
          title={
            keyGroups.length < 2
              ? isFillMode
                ? 'Ta sesja ma jedną grupę, więc nie ma co dzielić'
                : 'Klucz musi mieć co najmniej dwie grupy'
              : isFillMode
                ? 'Rozdaj brakujących uczniów naprzemiennie'
                : 'Rozdaj całą klasę naprzemiennie'
          }
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-colors cursor-pointer min-h-11 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Shuffle className="w-4 h-4" aria-hidden="true" />
          Podziel losowo
        </button>
        <button
          type="button"
          onClick={copyFromLastSession}
          disabled={isCopying}
          title="Przepisz skład grup z ostatniej sesji, która miała podział"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-colors cursor-pointer min-h-11 text-sm font-medium disabled:opacity-50"
        >
          <Copy className="w-4 h-4" aria-hidden="true" />
          {isCopying ? 'Wczytywanie…' : 'Kopiuj podział z ostatniej sesji'}
        </button>
      </div>

      {(error || decryptError) && (
        <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-4" role="alert">
          {error && <p className="text-sm text-rose-400">{error}</p>}
          {decryptError && (
            <p className={`text-sm text-rose-400${error ? ' mt-2' : ''}`}>{decryptError}</p>
          )}
        </div>
      )}

      {info && (
        <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl p-4" role="status">
          <p className="text-sm text-blue-300">{info}</p>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 sm:justify-end">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer min-h-11 disabled:opacity-50 font-medium"
        >
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          Wstecz
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors cursor-pointer min-h-11 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isSubmitting
            ? 'Zapisywanie…'
            : isFillMode
              ? `Przypisz do grup i przejdź do kolejki (${writingStudents.length} ${studentsWord(writingStudents.length)})`
              : `Rozpocznij sprawdzanie (${writingStudents.length} ${worksWord(writingStudents.length)})`}
        </button>
      </div>
    </div>
  );
}
