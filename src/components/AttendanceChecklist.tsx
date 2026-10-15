import { useState } from 'react';
import { useDecryptedStudents } from '../hooks/useDecryptedStudents';
import { pluralPolish } from '../utils/polish';
import { studentsWithoutGroup } from '../utils/grading';
import StudentSearchChecklist, { StudentChecklistSkeleton } from './StudentSearchChecklist';
import type { SessionGroupView, Student } from '../types';
import { ChevronLeft, UserX, Users } from 'lucide-react';

interface AttendanceChecklistProps {
  students: Student[];
  /** Grupy zamrożone na sesji. Bez nich checklista zostaje jedną listą całej klasy. */
  groups?: SessionGroupView[];
  /** Projekt nauczyciela: nieobecności, które checklista pokazuje zaznaczone na starcie */
  absentIds?: string[];
  /**
   * Lista realnie zapisana na sesji. Diff przydziału musi liczyć od niej, a nie od `absentIds`: po
   * powrocie z ekranu przydziału projekt jest już przesunięty, a baza wciąż twierdzi, że ten uczeń nie
   * pisał. Liczenie od projektu pokazałoby „Dokończ sprawdzanie" i zapisało nieobecność bez wariantu.
   */
  savedAbsentIds: string[];
  /** Uczniowie, którzy mają już pracę w tej sesji — nie wchodzą do kolejki i nie mogą być nieobecni */
  submittedIds?: string[];
  /**
   * Prace z już wyliczonymi punktami. Tego ucznia nie pytamy o grupę nawet po zdjęciu nieobecności:
   * jego ocena powstała w wariancie zapisanym w pracy, a kreator nie przelicza jej od nowa.
   */
  gradedIds?: string[];
  isSubmitting: boolean;
  /**
   * Nowa sesja grupowa: przydział zawsze jest następny, a sesja powstaje dopiero na tamtym kroku.
   * Wznowiona sesja nie potrzebuje tego flagowania — sama liczy, kto zdjął nieobecność i wciąż nie ma
   * wariantu (poniżej w `needsAssignment`).
   */
  withGroups?: boolean;
  /**
   * Sesja, w której wariant arkusza rozpoznaje model ze skanu. Ekranu przydziału wtedy nie ma, więc
   * checklista jest jedynym miejscem, gdzie nauczyciel dowiaduje się, co właściwie stanie się z wariantami.
   */
  variantDetection?: boolean;
  onBack: () => void;
  onConfirm: (absentStudentIds: string[]) => void;
}

const NO_GROUPS: SessionGroupView[] = [];

function absentWord(count: number): string {
  return pluralPolish(count, 'nieobecny', 'nieobecni', 'nieobecnych');
}

function worksWord(count: number): string {
  return pluralPolish(count, 'praca', 'prace', 'prac');
}

function studentsWord(count: number): string {
  return pluralPolish(count, 'uczeń', 'uczniów', 'uczniów');
}

/**
 * Checklista przed kolejką: nauczyciel odznacza osoby, które nie pisały sprawdzianu, więc kolejka
 * liczy tylko tyle prac, ile realnie powstało. Bez tego kroku kreator wymaga zdjęcia od każdego
 * ucznia w klasie, także od tego, który siedział w domu.
 *
 * Samą listę (wyszukiwarka, zbiorcze zaznaczanie, wiersze) robi StudentSearchChecklist — ten sam
 * komponent co przydział uczniów do grup, więc nazwisko szuka się identycznie w obu miejscach.
 *
 * W sesji grupowej lista dzieli się na sekcje per grupa, ale nieobecności wciąż są jedną płaską
 * listą: backend zna tylko `absent_student_ids`, a grupę i tak da się odtworzyć po przydziale.
 *
 * Następny ekran to nie zawsze kolejka. W nowej sesji grupowej zawsze jest to przydział do wariantów
 * (`withGroups`), we wznowionej tylko wtedy, gdy zdjęta nieobecność zostawiła czyjeś nazwisko bez grupy
 * (`needsAssignment`). Decyzja jest tu, a nie w rodzicu, bo przycisk musi obiecać dokładnie ten krok,
 * który rodzic pokaże — inaczej nauczyciel kliknie „sprawdzanie" i wyleci na wykaz grup.
 */
export default function AttendanceChecklist({
  students,
  groups = NO_GROUPS,
  absentIds = [],
  savedAbsentIds,
  submittedIds = [],
  gradedIds = [],
  isSubmitting,
  withGroups = false,
  variantDetection = false,
  onBack,
  onConfirm,
}: AttendanceChecklistProps) {
  const { decryptedStudents, isDecrypting, error: decryptError } = useDecryptedStudents(students);
  const [absent, setAbsent] = useState<string[]>(absentIds);

  const isGrouped = groups.length > 0;

  // Grupa to przydział na dziś. W sesji grupowej składem jest unia członków grup powiększona o
  // nieobecnych z bazy: na przydziale nie weszli do żadnej grupy, a ich praca z innego terminu ma
  // trafić do tej samej sesji — bez nich ich nazwisko znikałoby z tej listy na zawsze. Bazą jest ta
  // lista zapisana, a nie projekt nauczyciela, bo zdjęcie nieobecności nie może wyrzucić ucznia z
  // wykazu na trzy kliknięcia przed zapisem.
  const groupIds = new Set(groups.flatMap((group) => group.student_ids));
  const populationStudents = isGrouped
    ? decryptedStudents.filter((student) => groupIds.has(student.id) || savedAbsentIds.includes(student.id))
    : decryptedStudents;
  const unassignedCount = decryptedStudents.length - populationStudents.length;

  const pendingStudents = populationStudents.filter(
    (student) => !absent.includes(student.id) && !submittedIds.includes(student.id)
  );
  const pendingCount = pendingStudents.length;

  // Uczniowie, którym trzeba teraz wskazać wariant: zdjęci z nieobecności, którzy wciąż są poza
  // wszystkimi grupami sesji i nie mają sprawdzonej pracy. Bez tego kroku ich prace oceniłby zamrożony
  // klucz pierwszej grupy, a nie arkusz, który naprawdę dostali. Warunek `isGrouped` jest konieczny:
  // w sesji bez grup zdjęta nieobecność to codzienność, a ekranu przydziału nie ma o co prosić, więc
  // przycisk nie może obiecywać kroku, którego rodzic nie wykona.
  const assignmentCandidates = isGrouped
    ? studentsWithoutGroup(savedAbsentIds, absent, [...groupIds], gradedIds)
    : [];

  // Licznik na przycisku musi opisywać nazwiska z następnego ekranu: przy tworzeniu sesji to wszyscy
  // piszący, przy wznowieniu tylko ci bez przydziału. Zero nazwisk = kroku przydziału nie ma.
  const assignmentCount = withGroups ? pendingCount : assignmentCandidates.length;
  const needsAssignment = assignmentCount > 0;

  // Pusta kolejka blokuje start wyłącznie w nowej sesji. Przy wznowieniu nauczyciel ma prawo
  // oznaczyć całą resztę klasy jako piszącą później — wtedy zostaje mu tylko zapisać listę.
  const canConfirm = pendingCount > 0 || submittedIds.length > 0;

  // Przy wznowieniu uczeń ze sprawdzoną pracą nie ma tu nic do zrobienia — pokazujemy tylko
  // nieobecnych i tych bez pracy. Bez pracy wciąż zostają na liście, bo kliknięcie w ich nazwisko
  // to jedyny sposób, by cofnąć pomyłkowe „nie pisał".
  const hasGradedWorks = submittedIds.length > 0;
  const visibleStudents = hasGradedWorks
    ? populationStudents.filter((student) => absent.includes(student.id) || !submittedIds.includes(student.id))
    : populationStudents;
  const hiddenWithWorkCount = populationStudents.length - visibleStudents.length;

  const groupRows = groups.map((group) => {
    const ids = new Set(group.student_ids);
    const rows = visibleStudents.filter((student) => ids.has(student.id));
    return {
      group,
      rows,
      empty: group.student_ids.length === 0,
      writing: rows.filter((student) => !absent.includes(student.id)).length,
    };
  });

  // Nieobecny jest w populacji, ale nie w żadnej grupie — bez tej listy nie miałby gdzie kliknąć,
  // że już pisał. W sesji bez grup ci uczniowie są i tak na jednej liście.
  const outsideGroupRows = isGrouped ? visibleStudents.filter((student) => !groupIds.has(student.id)) : [];

  const toggleAbsent = (studentId: string) => {
    setAbsent((prev) => (prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]));
  };

  const markMany = (studentIds: string[], asAbsent: boolean) => {
    setAbsent((prev) => {
      const kept = prev.filter((id) => !studentIds.includes(id));
      return asAbsent ? [...kept, ...studentIds] : kept;
    });
  };

  const confirmLabel = isSubmitting
    ? 'Zapisywanie…'
    : needsAssignment
      ? `Dalej: przypisanie do grup (${assignmentCount} ${studentsWord(assignmentCount)})`
      : pendingCount === 0
        ? 'Zapisz nieobecności i pokaż wyniki'
        : `${submittedIds.length > 0 ? 'Dokończ' : 'Rozpocznij'} sprawdzanie (${pendingCount} ${worksWord(pendingCount)})`;

  if (isDecrypting) {
    return <StudentChecklistSkeleton />;
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 sm:space-y-6">
      {decryptError && (
        <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-4" role="alert">
          <p className="text-sm text-rose-400">{decryptError}</p>
        </div>
      )}

      <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6">
        <div className="flex items-start gap-3 mb-1">
          <div className="w-11 h-11 shrink-0 bg-blue-500/20 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-400" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-slate-100 break-words">Obecność przy sprawdzianie</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
              {hasGradedWorks
                ? 'Zaznacz osoby, które napisały sprawdzian w innym terminie — tylko one wejdą do kolejki. Nieobecni pozostają odznaczeni.'
                : 'Odznacz tylko osoby, które nie pisały pracy. Nie wejdą do kolejki, a ich pracę dołączysz do tej samej sesji, gdy napiszą ją w innym terminie.'}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-800/50 tabular-nums">
            {pendingCount} {worksWord(pendingCount)} do sprawdzenia
          </span>
          {submittedIds.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium bg-blue-950/40 text-blue-400 border border-blue-800/50 tabular-nums">
              z pracą: {submittedIds.length}
            </span>
          )}
          {absent.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium bg-amber-950/40 text-amber-400 border border-amber-800/50 tabular-nums">
              <UserX className="w-3.5 h-3.5" aria-hidden="true" />
              {absent.length} {absentWord(absent.length)}
            </span>
          )}
        </div>

        {assignmentCandidates.length > 0 && (
          <div className="mt-5 rounded-xl border border-blue-800/50 bg-blue-950/40 p-3 sm:p-4">
            <h3 className="text-sm sm:text-base font-semibold text-blue-300">
              Najpierw przydział do grup, potem kolejka
            </h3>
            <p className="text-xs sm:text-sm text-blue-200/80 mt-1 leading-relaxed">
              Z listy nieobecnych zdjęto {assignmentCandidates.length} {studentsWord(assignmentCandidates.length)},
              a ta sesja ma już zapisany podział na grupy. Kolejny krok pyta, który wariant arkusza dostał każdy z
              nich — bez niego ich prace oceniłby zamrożony klucz pierwszej grupy, a nie arkusz faktycznie rozdany.
              Przydział zapisze się razem z nieobecnościami w jednym żądaniu.
            </p>
          </div>
        )}

        {variantDetection && !isGrouped ? (
          <div className="mt-5 rounded-xl border border-blue-800/50 bg-blue-950/40 p-3 sm:p-4">
            <h3 className="text-sm sm:text-base font-semibold text-blue-300">Warianty rozpozna AI</h3>
            <p className="text-xs sm:text-sm text-blue-200/80 mt-1 leading-relaxed">
              Nikt nie jest przypisywany do grup. Przy sprawdzaniu model porówna treść każdej kartki z
              wariantami tego klucza i oceni ją tym, który na kartce trafił. Pracy, co do której nie będzie
              pewny, nie oceni wcale — zostanie bez punktów i bez pobranej strony, a jej wariant wskażesz
              jednym kliknięciem w wynikach.
            </p>
          </div>
        ) : null}

        {isGrouped ? (
          <div className="mt-5 space-y-4">
            {groupRows.map(({ group, rows, writing, empty }) => (
              <section
                key={group.name}
                className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-3 sm:p-4"
                aria-label={`Grupa ${group.name}`}
              >
                {empty ? (
                  <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                    Ta grupa nie ma w tej sesji żadnego ucznia. Kto napisze jej arkusz w innym terminie, ten
                    pojawi się w sekcji „Inny termin” po odznaczeniu nieobecności — przydział wskaże mu ten
                    wariant.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base sm:text-lg font-semibold text-slate-100 break-words">{group.name}</h3>
                      <span className="text-xs sm:text-sm text-slate-400 tabular-nums">
                        pisze: {writing} z {rows.length}
                      </span>
                    </div>

                    <StudentSearchChecklist
                      students={rows}
                      lockedIds={submittedIds}
                      isChecked={(studentId) => !absent.includes(studentId)}
                      onToggle={toggleAbsent}
                      onMarkMany={markMany}
                      masterLabel={{ all: 'Wszyscy pisali', filtered: 'Widoczni pisali' }}
                      counterWord="piszących"
                      rowAriaPrefix="Uczeń pisał sprawdzian"
                      dimWhenUnchecked
                      renderTag={(studentId) =>
                        absent.includes(studentId) ? (
                          <span className="shrink-0 text-xs font-medium text-amber-400">nie pisał</span>
                        ) : null
                      }
                      emptyListNote="Każdy uczeń tej grupy ma już pracę w tej sesji."
                    />
                  </>
                )}
              </section>
            ))}

            {outsideGroupRows.length > 0 && (
              <section
                className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-3 sm:p-4"
                aria-label="Uczniowie piszący w innym terminie"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base sm:text-lg font-semibold text-slate-100 break-words">Inny termin</h3>
                  <span className="text-xs sm:text-sm text-slate-400 tabular-nums">
                    pisze: {outsideGroupRows.filter((student) => !absent.includes(student.id)).length} z{' '}
                    {outsideGroupRows.length}
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                  Ci uczniowie nie trafili do żadnej grupy, bo byli nieobecni przy rozdawaniu wariantów. Zaznacz
                  tych, którzy napisali sprawdzian później — następny krok każe wskazać, którą grupę tej sesji
                  im przydzielasz, więc ich praca zostanie sprawdzona arkuszem, który wybierzesz sam.
                </p>

                <StudentSearchChecklist
                  students={outsideGroupRows}
                  lockedIds={submittedIds}
                  isChecked={(studentId) => !absent.includes(studentId)}
                  onToggle={toggleAbsent}
                  onMarkMany={markMany}
                  masterLabel={{ all: 'Wszyscy pisali', filtered: 'Widoczni pisali' }}
                  counterWord="piszących"
                  rowAriaPrefix="Uczeń pisał sprawdzian"
                  dimWhenUnchecked
                  renderTag={(studentId) =>
                    absent.includes(studentId) ? (
                      <span className="shrink-0 text-xs font-medium text-amber-400">nie pisał</span>
                    ) : null
                  }
                  emptyListNote="Nikt nie czeka na sprawdzian w innym terminie."
                />
              </section>
            )}

            {unassignedCount > 0 && (
              <p className="pt-4 border-t border-slate-800/60 text-xs sm:text-sm text-slate-400 tabular-nums">
                Poza grupami: {unassignedCount} {studentsWord(unassignedCount)}. Nie są składem tej sesji — zwykle
                to uczniowie dopisani do klasy już po jej utworzeniu. Ten sprawdzian trzeba sprawdzić im w osobnej
                sesji.
              </p>
            )}
          </div>
        ) : (
          <StudentSearchChecklist
            students={visibleStudents}
            lockedIds={submittedIds}
            isChecked={(studentId) => !absent.includes(studentId)}
            onToggle={toggleAbsent}
            onMarkMany={markMany}
            masterLabel={{ all: 'Wszyscy pisali', filtered: 'Widoczni pisali' }}
            counterWord="piszących"
            rowAriaPrefix="Uczeń pisał sprawdzian"
            dimWhenUnchecked
            renderTag={(studentId) =>
              absent.includes(studentId) ? (
                <span className="shrink-0 text-xs font-medium text-amber-400">nie pisał</span>
              ) : null
            }
            emptyListNote="Nie ma kogo wpisać do kolejki — każdy uczeń z tej klasy ma już pracę w sesji."
          />
        )}

        {hiddenWithWorkCount > 0 && (
          <p className="mt-4 pt-4 border-t border-slate-800/60 text-xs sm:text-sm text-slate-400 tabular-nums">
            Poza listą: {hiddenWithWorkCount} {studentsWord(hiddenWithWorkCount)}, którzy mają już pracę w tej
            sesji. Ich oceny zobaczysz w historii sprawdzania.
          </p>
        )}
      </div>

      {pendingCount === 0 && submittedIds.length > 0 && (
        <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl p-4" role="status">
          <p className="text-sm text-blue-300">
            Każdy uczeń ma już pracę w tej sesji albo oznaczoną nieobecność. Nic więcej nie trafi do kolejki
            — zapisz listę i przejdź do wyników.
          </p>
        </div>
      )}

      {pendingCount === 0 && submittedIds.length === 0 && (
        <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-4" role="alert">
          <p className="text-sm text-rose-400">
            Nie możesz odznaczyć całej klasy. Zostaw przynajmniej jednego ucznia, żeby sesja miała co sprawdzać.
          </p>
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
          onClick={() => onConfirm(absent)}
          disabled={isSubmitting || !canConfirm}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors cursor-pointer min-h-11 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
