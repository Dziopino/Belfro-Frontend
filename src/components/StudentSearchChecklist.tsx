import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { pluralPolish } from '../utils/polish';
import type { DecryptedStudent } from '../hooks/useDecryptedStudents';

interface StudentSearchChecklistProps {
  students: DecryptedStudent[];
  /** Poza zbiorczym zaznaczaniem i licznikiem: wiersze tych uczniów nadal przełączają się pojedynczo */
  lockedIds?: string[];
  isChecked: (studentId: string) => boolean;
  onToggle: (studentId: string) => void;
  onMarkMany: (studentIds: string[], checked: boolean) => void;
  /** Etykieta zbiorczego pola — inna, gdy nauczyciel czegoś szuka i klika tylko widoczną część listy */
  masterLabel: { all: string; filtered: string };
  /** Słówko licznika po lewej, np. „piszących” albo „przypisanych” */
  counterWord: string;
  searchPlaceholder?: string;
  /** Nazwisko przekreślamy tylko, gdy odznaczenie ma znaczenie ujemne (uczeń nieobecny); przy przydziale do grupy wiersz pozostaje zwyczajny */
  dimWhenUnchecked?: boolean;
  /** Przedrostek etykiety wiersza dla czytnika ekranu — mówi, co znaczy zaznaczenie */
  rowAriaPrefix?: string;
  renderTag?: (studentId: string) => ReactNode;
  emptyListNote?: string;
}

function studentsWord(count: number): string {
  return pluralPolish(count, 'uczeń', 'uczniów', 'uczniów');
}

/** Szkielet listy uczniów; używany tam, gdzie cała karta czeka na deszyfrowanie. */
export function StudentChecklistSkeleton() {
  return (
    <div
      className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6 w-full max-w-3xl mx-auto animate-pulse motion-reduce:animate-none"
      aria-busy="true"
    >
      <div className="h-6 w-48 rounded bg-slate-800" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 rounded-xl bg-slate-800/60" />
        ))}
      </div>
      <p className="sr-only">Wczytywanie listy uczniów</p>
    </div>
  );
}

/**
 * Lista uczniów z wyszukiwarką i zbiorczym zaznaczaniem — wspólny rdzeń checklisty obecności
 * i przydziału do grup. Klasa to zwykle 30 nazwisk, więc bez wyszukiwarki i jednego pola na górze
 * „cofnij całą klasę" oznaczałoby trzydzieści kliknięć.
 *
 * Komponent trzyma tylko wyszukiwany tekst i sposób zaznaczania; znaczenie „zaznaczonego"
 * (pisał / jest w grupie) oraz całą resztę karty zostawia rodzicowi. Filtrowanie idzie po już
 * odszyfrowanych polach, więc nie dokłada żadnych wywołań sieciowych.
 */
export default function StudentSearchChecklist({
  students,
  lockedIds = [],
  isChecked,
  onToggle,
  onMarkMany,
  masterLabel,
  counterWord,
  searchPlaceholder,
  dimWhenUnchecked = false,
  rowAriaPrefix = 'Uczeń',
  renderTag,
  emptyListNote,
}: StudentSearchChecklistProps) {
  const [query, setQuery] = useState('');
  // Kilka list na jednym ekranie (sekcja na grupę) nie może współdzić jednego id pola
  const searchId = useId();

  // Klasa numerowana nie ma nazwisk, więc nie możemy obiecywać szukania po nich.
  const isNumbered = students.length > 0 && students.every((student) => student.numbered);
  const placeholder =
    searchPlaceholder ??
    (isNumbered ? 'Szukaj po numerze z dziennika' : 'Szukaj po imieniu, nazwisku lub numerze');

  const needle = query.trim().toLowerCase();
  const filteredStudents =
    needle.length === 0
      ? students
      : students.filter((student) => `${student.label} ${student.number}`.toLowerCase().includes(needle));

  // Zbiorcze kliknięcie nie może sięgnąć po ucznia zablokowanego: jego pozycja jest ustalona,
  // więc przełączanie go byłoby tylko zmianą już zapisanej wartości.
  const selectableIds = filteredStudents
    .filter((student) => !lockedIds.includes(student.id))
    .map((student) => student.id);
  const checkedCount = filteredStudents.filter(
    (student) => isChecked(student.id) && !lockedIds.includes(student.id)
  ).length;
  const allChecked = selectableIds.length > 0 && checkedCount === selectableIds.length;
  const noneChecked = selectableIds.length > 0 && checkedCount === 0;

  const masterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (masterRef.current) masterRef.current.indeterminate = !allChecked && !noneChecked;
  }, [allChecked, noneChecked]);

  return (
    <>
      {students.length > 0 && (
        <div className="mt-5">
          <label htmlFor={searchId} className="sr-only">
            {placeholder}
          </label>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full pl-10 pr-11 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base"
              placeholder={placeholder}
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
      )}

      {selectableIds.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-800/60 flex flex-wrap items-center gap-x-3 gap-y-1">
          <label className="flex items-center gap-3 cursor-pointer min-h-11">
            <input
              ref={masterRef}
              type="checkbox"
              checked={allChecked}
              onChange={() => onMarkMany(selectableIds, allChecked)}
              className="w-5 h-5 shrink-0 cursor-pointer accent-blue-600"
              aria-label={
                allChecked
                  ? `Odznacz wszystkich: ${selectableIds.length} ${studentsWord(selectableIds.length)}`
                  : `Zaznacz wszystkich: ${selectableIds.length} ${studentsWord(selectableIds.length)}`
              }
            />
            <span className="text-sm sm:text-base font-medium text-slate-100">
              {needle.length === 0 ? masterLabel.all : masterLabel.filtered}
            </span>
          </label>
          <span className="ml-auto text-xs sm:text-sm text-slate-400 tabular-nums">
            {counterWord}: {checkedCount} z {selectableIds.length}
          </span>
        </div>
      )}

      <ul className="mt-4 divide-y divide-slate-800/60">
        {filteredStudents.map((student) => {
          const checked = isChecked(student.id);

          return (
            <li key={student.id}>
              <label className="flex items-center gap-3 py-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(student.id)}
                  className="w-5 h-5 shrink-0 cursor-pointer accent-blue-600"
                  aria-label={`${rowAriaPrefix}: ${student.label}`}
                />
                {!student.numbered && (
                  <span className="w-8 shrink-0 text-xs sm:text-sm text-slate-400 tabular-nums">
                    {student.number}
                  </span>
                )}
                <span
                  className={`flex-1 min-w-0 truncate text-sm sm:text-base ${
                    dimWhenUnchecked && !checked ? 'text-slate-400 line-through' : 'text-slate-100'
                  }`}
                >
                  {student.label}
                </span>
                {renderTag?.(student.id)}
              </label>
            </li>
          );
        })}
      </ul>

      {filteredStudents.length === 0 && needle.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-800/60 text-center">
          <p className="text-sm text-slate-400">Żaden uczeń nie pasuje do „{query.trim()}”.</p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer min-h-11 text-sm font-medium"
          >
            Wyczyść wyszukiwanie
          </button>
        </div>
      )}

      {students.length === 0 && emptyListNote && <p className="mt-4 text-sm text-slate-400">{emptyListNote}</p>}
    </>
  );
}
