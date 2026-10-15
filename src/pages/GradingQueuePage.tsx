import { Fragment, useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { classesAPI, studentsAPI, gradingAPI } from '../services/apiService';
import CreateSessionForm from '../components/CreateSessionForm';
import SessionGroupsEditor from '../components/SessionGroupsEditor';
import ThresholdSelection from '../components/ThresholdSelection';
import AttendanceChecklist from '../components/AttendanceChecklist';
import GradingQueue from '../components/GradingQueue';
import GradingResults from '../components/GradingResults';
import Sidebar from '../components/Sidebar';
import HeaderAccount from '../components/HeaderAccount';
import { useAuth } from '../contexts/AuthContext';
import type {
  Class,
  Student,
  AnswerKey,
  AnswerKeyGroupView,
  CreateSessionGroupRequest,
  GradingSession,
  GradingSessionGroup,
  SessionGroupView,
} from '../types';
import { Bell, CheckCircle2 } from 'lucide-react';
import { apiErrorMessage } from '../utils/apiError';
import { studentsWithoutGroup } from '../utils/grading';

type PageState = 'form' | 'thresholds' | 'attendance' | 'groups' | 'queue' | 'results';

/**
 * Lista nieobecnych odczytana z zapisanej sesji. Odpowiedź PUT/PATCH zawsze ją niesie, ale typ dopuszcza
 * jej brak, a zgadywanie pustą tablicą cofnęłoby baseline diffu przydziału do zera.
 */
function absentListOf(session: GradingSession, fallback: string[]): string[] {
  return Array.isArray(session.absent_student_ids) ? session.absent_student_ids : fallback;
}

// Kolejność kroków paska nad kreatorem; 'attendance' to checklista nieobecności, a 'groups' to
// przydział uczniów do wariantów z klucza — dopiero po nieobecnościach, bo na przydziale widać tylko
// tych, którzy dziś piszą.
const STEPS: { key: PageState; label: string }[] = [
  { key: 'form', label: 'Klucz odpowiedzi' },
  { key: 'thresholds', label: 'Progi ocen' },
  { key: 'attendance', label: 'Obecność' },
  { key: 'groups', label: 'Przypisanie grup' },
  { key: 'queue', label: 'Kolejka' },
  { key: 'results', label: 'Wyniki' },
];

export default function GradingQueuePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { classId } = useParams<{ classId: string }>();
  const [searchParams] = useSearchParams();
  const resumeSessionId = searchParams.get('session');

  const [pageState, setPageState] = useState<PageState>('form');
  const [classData, setClassData] = useState<Class | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [answerKey, setAnswerKey] = useState<AnswerKey | null>(null);
  const [answerKeyId, setAnswerKeyId] = useState<string | null>(null);
  // Warianty wybranego klucza: dwie lub więcej grup oznacza tryb grupowy bez żadnego przełącznika
  const [keyGroups, setKeyGroups] = useState<AnswerKeyGroupView[]>([]);
  // Przydział zrobiony po liście obecności — do powstania sesji istnieje tylko w tym stanie
  const [groupDrafts, setGroupDrafts] = useState<CreateSessionGroupRequest[] | null>(null);
  // Grupy wznowionej sesji — bez nich nie da się pokazać ani filtra w kolejce, ani nieobecności per grupa
  const [sessionGroups, setSessionGroups] = useState<GradingSessionGroup[]>([]);
  // Czy ta sesja rozpoznaje warianty z treści kartki? Dla sesji z bazy to snapshot z niej, dla nowej — ustawienie konta.
  const [variantDetection, setVariantDetection] = useState(false);
  const [thresholdId, setThresholdId] = useState<string | null>(null);
  const [absentIds, setAbsentIds] = useState<string[]>([]);
  // Nieobecności realnie zapisane w bazie. `absentIds` to tylko projekt nauczyciela — diff, z którego
  // liczymy uczniów bez wariantu, musi iść za zapisem, inaczej samo kliknięcie „Wstecz" na przydziale
  // zamieniłoby zdjętą nieobecność w fakt zapisany i uczeń przeszedłby do kolejki bez grupy.
  const [savedAbsentIds, setSavedAbsentIds] = useState<string[]>([]);
  // Uczniowie, którzy mają już wiersz pracy w tej sesji — wznawiamy kolejkę bez nich
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  // Prace z wyliczonymi punktami. Ich przydziału nie wolno ruszać, bo punkty liczono starym wariantem,
  // a żadnego ponownego przeliczenia ten kreator nie wykonuje.
  const [gradedIds, setGradedIds] = useState<string[]>([]);
  // Odznaczeni z nieobecności, a wciąż bez grupy — to wyłącznie ich pytamy na przydziale wznowionej sesji
  const [assignmentCandidates, setAssignmentCandidates] = useState<string[]>([]);
  const [queueStudents, setQueueStudents] = useState<Student[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!classId) return;

    if (resumeSessionId) {
      loadExistingSession(resumeSessionId);
    } else {
      loadClassAndStudents();
    }
  }, [classId, resumeSessionId]);

  const loadClassAndStudents = async () => {
    if (!classId) return;

    try {
      setIsLoading(true);
      setError('');

      // Pobierz klasę
      const { class: fetchedClass } = await classesAPI.getClass(classId);
      setClassData(fetchedClass);

      // Pobierz uczniów
      const { students: fetchedStudents } = await studentsAPI.getStudents(classId);

      if (fetchedStudents.length === 0) {
        setError('Brak uczniów w tej klasie. Dodaj uczniów przed rozpoczęciem sprawdzania.');
        setIsLoading(false);
        return;
      }

      setStudents(fetchedStudents);
      setIsLoading(false);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się załadować danych'));
      setIsLoading(false);
    }
  };

  /**
   * Wznawianie sesji z historii: `/grading/:classId?session=<id>` pomija klucz i progi (sesja już je ma)
   * i pokazuje checklistę z zapisanymi nieobecnościami oraz uczniami z przesłaną pracą.
   */
  const loadExistingSession = async (sessionIdParam: string) => {
    if (!classId) return;

    try {
      setIsLoading(true);
      setError('');

      const [{ session: fetched }, { class: fetchedClass }, { students: fetchedStudents }] = await Promise.all([
        gradingAPI.getSession(sessionIdParam),
        classesAPI.getClass(classId),
        studentsAPI.getStudents(classId),
      ]);

      // Sesja należy do innej klasy? Adres mógł zostać przeklejony albo nauczyciel przełączył klasę.
      if (fetched.class_id !== classId) {
        setError('Ta sesja należy do innej klasy. Otwórz ją z historii tej klasy, którą sprawdzasz.');
        setIsLoading(false);
        return;
      }

      setClassData(fetchedClass);
      setStudents(fetchedStudents);
      setSessionId(fetched.id);
      setAnswerKey(fetched.answer_key);
      setAnswerKeyId(fetched.answer_key_id ?? null);
      setThresholdId(fetched.grade_threshold_id ?? null);
      const storedAbsent = Array.isArray(fetched.absent_student_ids) ? fetched.absent_student_ids : [];
      setAbsentIds(storedAbsent);
      setSavedAbsentIds(storedAbsent);
      setSubmittedIds((fetched.grades ?? []).map((grade) => grade.student_id));
      setGradedIds(
        (fetched.grades ?? []).filter((grade) => grade.final_points !== null).map((grade) => grade.student_id)
      );
      setSessionGroups(fetched.session_groups ?? []);
      // Definicje wariantów bierzemy z zamrożonych wierszy sesji, nie z klucza w bibliotece: nauczyciel
      // mógł go edytować po utworzeniu sesji, a punkty i tak liczono z migawki zapisanej na grupie.
      setKeyGroups(
        (fetched.session_groups ?? []).map((group) => ({
          name: group.name,
          total_points: group.answer_key.total_points,
        }))
      );
      setVariantDetection(fetched.group_assignment_mode === 'ai');
      setPageState('attendance');
      setIsLoading(false);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się otworzyć sesji do dokończenia'));
      setIsLoading(false);
    }
  };

  const handleSessionCreated = (
    createdAnswerKey: AnswerKey,
    createdAnswerKeyId: string | null,
    variants: AnswerKeyGroupView[]
  ) => {
    setAnswerKey(createdAnswerKey);
    setAnswerKeyId(createdAnswerKeyId);
    setKeyGroups(variants);
    setPageState('thresholds');
  };

  const handleThresholdsSelected = (selectedThresholdId: string | null) => {
    setThresholdId(selectedThresholdId);
    setPageState('attendance');
  };

  /**
   * Grupy dla kroków po sesji: szkic z przydziału ma pierwszeństwo, bo dopóki sesja nie powstała,
   * nie ma czego czytać z bazy. Tablica jest memoizowana — kolejka deszyfruje uczniów na jej
   * podstawie, a nowa referencja przy każdym renderze restartowałaby deszyfrację w nieskończoność.
   */
  const groupViews = useMemo<SessionGroupView[]>(() => {
    const source: Array<{ name: string; student_ids: string[] }> = groupDrafts ?? sessionGroups;
    return source.map((group) => ({ name: group.name, student_ids: group.student_ids }));
  }, [groupDrafts, sessionGroups]);

  /**
   * Skład grup już zapisany w sesji, w tej samej kolejności co `keyGroups` (oba z `sessionGroups`,
   * a serwer zwraca wiersze uporządkowane po `position`). `undefined` bez sesji to nie uproszczenie:
   * to ten brak odróżnia tryb tworzenia od uzupełnienia, bo edytor nie ma innego powodu pytać o
   * połowę klasy. Tablica musi być memoizowana jak `groupViews` — edytor deszyfruje na niej nazwiska,
   * a nowa referencja przy każdym renderze restartowałaby deszyfrację w nieskończoność i kasowała
   * kliknięcia już zrobione na wykazie.
   */
  const existingMembers = useMemo<string[][] | undefined>(
    () => (sessionId ? sessionGroups.map((group) => group.student_ids) : undefined),
    [sessionId, sessionGroups]
  );

  // Wykaz przydziału: nowa sesja pyta o całą klasę (edytor sam odrzuci nieobecnych), wznowiona tylko o
  // tych, którzy właśnie stracili nieobecność i wciąż są bez wariantu.
  const assignmentStudents = useMemo<Student[]>(() => {
    if (!sessionId) return students;
    const candidates = new Set(assignmentCandidates);
    return students.filter((student) => candidates.has(student.id));
  }, [students, sessionId, assignmentCandidates]);

  // Ustawienie konta: przy 'ai' wariant pracy rozpoznaje model ze skanu, więc ekran przydziału znika
  const assignmentMode = user?.group_assignment_mode ?? 'manual';
  const detectsVariants = sessionId ? variantDetection : assignmentMode === 'ai';

  // Tryb grupowy wynika z danych, nie z przełącznika: klucz z wariantami albo sesja, która je już ma.
  // Rozpoznawanie wygasza go całkowicie — tam składem sesji jest klasa minus nieobecni, a wariant
  // wynika z treści kartki, więc nie ma czego przypisywać ani po czym filtrować kolejki.
  const groupsMode = !detectsVariants && (keyGroups.length >= 2 || sessionGroups.length > 0);

  /**
   * Wspólne zamknięcie kroków przed kolejką: zapisuje nieobecności (sesji grupowej razem z przydziałem
   * do wariantów, bo jedno żądanie nie pozwala zostać nazwisku bez wariantu) i decyduje, czy jest co
   * sprawdzać, czy jedziemy do wyników.
   */
  const persistAndAdvance = async (nextAbsentIds: string[], assignment: CreateSessionGroupRequest[] | null) => {
    if (!classId) return;

    // Sesja grupowa sprawdza tych, którzy trafili do którejś grupy, plus zapisanych nieobecnych.
    // Bez nich uczeń, który pisał w innym terminie, nie wszedłby na przydziale do żadnej grupy i
    // jego praca nigdy nie dotarłaby do kolejki — mimo że odznaczenie nieobecności jest tu legalne.
    // Lista musi być świeża: przy wznowieniu nauczyciel zdejmuje nieobecność i zapisuje listę jednym
    // kliknięciem, a stan `absentIds` zaktualizuje się dopiero po tym renderze.
    // Bez grup składem jest cała klasa; pusty Set filtera wyłączyłby wszystkich.
    const groupStudentIds = (assignment ?? groupViews).flatMap((group) => group.student_ids);
    const populationIds = groupStudentIds.length > 0 ? new Set([...groupStudentIds, ...nextAbsentIds]) : null;

    const missingStudents = students.filter(
      (student) =>
        (!populationIds || populationIds.has(student.id)) &&
        !nextAbsentIds.includes(student.id) &&
        !submittedIds.includes(student.id)
    );

    // Pusta kolejka ma sens tylko przy wznowionej sesji: tam już leżą sprawdzone prace, a reszta
    // klasy napisze sprawdzian w innym terminie. Nowa sesja bez niczego do sprawdzenia nie miałaby
    // czego tworzyć w bazie.
    if (missingStudents.length === 0 && !sessionId) {
      setError('Cała klasa oznaczona jako nieobecna. Zostaw przynajmniej jednego ucznia do sprawdzenia.');
      return;
    }

    // Trzy zapisy mają trzy różne zdania o porażce: POST tworzy sesję, PATCH bez przydziału rusza tylko
    // nieobecności, a PATCH z przydziałem zmienia skład grup już zapisanej sesji.
    const saveFailure = sessionId
      ? assignment
        ? 'Nie udało się zapisać przydziału do grup'
        : 'Nie udało się zapisać nieobecności'
      : 'Nie udało się utworzyć sesji sprawdzania';

    try {
      setIsSubmitting(true);
      setError('');

      if (sessionId) {
        const { session } = assignment
          ? await gradingAPI.updateSessionGroups(sessionId, assignment, nextAbsentIds)
          : await gradingAPI.updateSessionAbsent(sessionId, nextAbsentIds);
        setSessionGroups(session.session_groups ?? []);
        setAssignmentCandidates([]);
        setSavedAbsentIds(absentListOf(session, nextAbsentIds));
      } else {
        const { session } = await gradingAPI.createSession(
          assignment
            ? {
                class_id: classId,
                // Bez answer_key: przy grupach każda z nich dostaje swój wariant z biblioteki
                answer_key_id: answerKeyId,
                groups: assignment,
                grade_threshold_id: thresholdId,
                absent_student_ids: nextAbsentIds,
              }
            : {
                class_id: classId,
                answer_key: answerKey!,
                answer_key_id: answerKeyId,
                grade_threshold_id: thresholdId,
                absent_student_ids: nextAbsentIds,
              }
        );

        setSessionId(session.id);
        // Od tej chwili kreator pyta sesję, nie konto: tryb jest zamrożony na niej i później się nie zmienia
        setVariantDetection(session.group_assignment_mode === 'ai');
        setSavedAbsentIds(absentListOf(session, nextAbsentIds));
      }

      if (missingStudents.length === 0) {
        // GradingResults sam decyduje o wywołaniu /process i robi to tylko wtedy, gdy któraś praca
        // wciąż nie ma punktów, więc przy samej liście nieobecności żadnego płacenia nie będzie.
        setPageState('results');
        return;
      }

      setQueueStudents(missingStudents);
      setPageState('queue');
    } catch (err: any) {
      setError(apiErrorMessage(err, saveFailure));
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Checklista zamyka krok przed kolejką: bez grup sesja powstaje właśnie tutaj, więc nieobecności
   * wchodzą do niej od razu. Z grupami zatrzymujemy się na przydziale, żeby żadna praca nie była
   * oceniona wariantem wskazanym przez fallback zamiast przez nauczyciela. Nowa sesja pyta zawsze —
   * nikt jeszcze nie ma grupy. Wznowiona tylko wtedy, gdy ktoś realnie stracił nieobecność i wciąż
   * jest bez przydziału; skład zapisany w bazie zostaje nietknięty, bo nauczyciel nie przyszedł
   * przepisywać podziału całej klasy. Bazą diffu jest `savedAbsentIds`, a nie `absentIds`: po powrocie
   * z przydziału projekt jest już przesunięty, więc porównanie dwóch projektów dałoby pustą listę, a
   * PATCH zapisałby nieobecność bez wskazanego wariantu — dokładnie tę dziurę, którą ten krok zamyka.
   */
  const handleAttendanceConfirmed = async (nextAbsentIds: string[]) => {
    setAbsentIds(nextAbsentIds);

    if (groupsMode) {
      if (!sessionId) {
        setPageState('groups');
        return;
      }

      const candidates = studentsWithoutGroup(
        savedAbsentIds,
        nextAbsentIds,
        groupViews.flatMap((group) => group.student_ids),
        gradedIds
      );

      if (candidates.length > 0) {
        setAssignmentCandidates(candidates);
        setPageState('groups');
        return;
      }
    }

    await persistAndAdvance(nextAbsentIds, null);
  };

  /**
   * Przydział domyka krok przed kolejką. Nowa sesja idzie z nim do jednego POST-a, więc nigdy nie
   * powstanie bez składu którejś grupy; wznowiona dostaje PATCH-a z nieobecnościami w tym samym
   * żądaniu, żeby zdjęcie nieobecności nie zostało w bazie bez wskazanego wariantu.
   */
  const handleAssignmentConfirmed = async (assignment: CreateSessionGroupRequest[]) => {
    if (!sessionId) setGroupDrafts(assignment);
    await persistAndAdvance(absentIds, assignment);
  };

  /**
   * Pominięcie w trakcie kolejki dopisuje nieobecność do już istniejącej sesji.
   * Bez zapisu uczeń zniknąłby z kolejki tylko do następnego odświeżenia strony.
   */
  const handleStudentSkipped = async (studentId: string) => {
    const nextAbsentIds = absentIds.includes(studentId) ? absentIds : [...absentIds, studentId];
    setAbsentIds(nextAbsentIds);

    if (!sessionId) return;

    try {
      await gradingAPI.updateSessionAbsent(sessionId, nextAbsentIds);
      setSavedAbsentIds(nextAbsentIds);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się zapisać nieobecności ucznia'));
    }
  };

  const handleQueueComplete = () => {
    setPageState('results');
  };

  const handleBack = () => {
    if (!classId) return;

    // Wznawiona sesja jest już zapisana w bazie, więc wyjście z niej nic nie kosztuje nauczyciela
    if (pageState === 'form' || sessionId) {
      navigate(`/classes/${classId}`);
      return;
    }

    if (
      window.confirm('Czy na pewno chcesz przerwać sprawdzanie? Postęp zostanie utracony.')
    ) {
      navigate(`/classes/${classId}`);
    }
  };

  // Krok „Przypisanie grup" istnieje tylko przy kluczu z wariantami — pasek nie może obiecywać kroku, którego nie będzie
  const visibleSteps = groupsMode ? STEPS : STEPS.filter((step) => step.key !== 'groups');
  const currentStepIndex = visibleSteps.findIndex((step) => step.key === pageState);

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-[#0B0F19]">
        <Sidebar />
        <div className="flex-1 w-full lg:ml-64 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin motion-reduce:animate-none rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-slate-400">Ładowanie…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0B0F19]">
      <Sidebar />

      <div className="flex-1 w-full lg:ml-64">
        {/* Header */}
        <header className="h-14 sm:h-16 bg-[#131B2E] border-b border-slate-800/60 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-10">
          {/* Left side - Mobile: Space for hamburger + Title, Desktop: Back + Title */}
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            {/* Mobile: Space for hamburger */}
            <div className="lg:hidden w-12"></div>

            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium rounded-lg transition-colors text-xs whitespace-nowrap cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Powrót
            </button>
            <div className="border-l border-slate-800/60 pl-2 sm:pl-4 min-w-0">
              <h1 className="text-sm sm:text-lg font-bold text-slate-100 truncate">Sprawdzanie prac</h1>
              {classData && (
                <p className="text-xs text-slate-400 tabular-nums">
                  Uczniów: {students.length}
                  {submittedIds.length > 0 ? ` • z pracą: ${submittedIds.length}` : ''}
                </p>
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-4">
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
        <main id="main-content" tabIndex={-1} className="p-3 sm:p-4 lg:p-6">
          {error && (
            <div className="mb-4 sm:mb-6 bg-rose-950/40 border border-rose-800/50 rounded-xl p-3 sm:p-4" role="alert">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}

          {/* Progress Indicator - Mobile Optimized */}
          <div className="mb-6 sm:mb-8 overflow-x-auto">
            <div className="flex items-center justify-start sm:justify-center min-w-max sm:min-w-0 px-2">
              {visibleSteps.map((step, index) => {
                // Przydział grup wznowionej sesji jest już zapisany w bazie — ten krok minął, choć
                // na pasku leży przed krokiem, w którym aktualnie jesteśmy. Wyjątek: właśnie uzupełniamy
                // cudzy przydział, więc krok ma świecić się jako aktywny, a nie odhaczony.
                const isDone =
                  index < currentStepIndex ||
                  (step.key === 'groups' && Boolean(sessionId) && assignmentCandidates.length === 0);
                const isActive = index === currentStepIndex;

                return (
                  <Fragment key={step.key}>
                    {index > 0 && <div className="w-8 sm:w-16 h-0.5 bg-slate-800 mx-1 sm:mx-2"></div>}

                    <div
                      className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 rounded-xl transition-all ${
                        isDone
                          ? 'bg-emerald-500/20 border border-emerald-500/50'
                          : isActive
                          ? 'bg-blue-500/20 border border-blue-500/50'
                          : 'bg-slate-800/50 border border-slate-700'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-semibold transition-all text-sm ${
                          isDone
                            ? 'bg-emerald-600 text-white'
                            : isActive
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <span
                        className={`text-xs sm:text-sm font-medium whitespace-nowrap ${
                          isDone ? 'text-emerald-400' : isActive ? 'text-blue-400' : 'text-slate-400'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>

          {/* Conditional Content */}
          {pageState === 'form' && classId && (
            <CreateSessionForm onSessionCreated={handleSessionCreated} />
          )}

          {pageState === 'thresholds' && (
            <ThresholdSelection onSelected={handleThresholdsSelected} />
          )}

          {pageState === 'attendance' && (
            <AttendanceChecklist
              students={students}
              groups={groupViews}
              absentIds={absentIds}
              savedAbsentIds={savedAbsentIds}
              submittedIds={submittedIds}
              gradedIds={gradedIds}
              isSubmitting={isSubmitting}
              // Nowa sesja grupowa: ten krok nic jeszcze nie zapisuje, sesja powstanie na przydziale.
              // Wznowiona pyta o przydział sama, gdy ktoś zdjął nieobecność — patrz needsAssignment.
              withGroups={groupsMode && !sessionId}
              variantDetection={detectsVariants}
              // Progi istniejącej sesji zmieniłoby się tylko w bazie, więc w trybie wznowienia
              // wracamy do podsumowania sesji zamiast w krok, który i tak nic nie zapisze.
              onBack={() => (sessionId ? navigate(`/history/${sessionId}`) : setPageState('thresholds'))}
              onConfirm={handleAttendanceConfirmed}
            />
          )}

          {pageState === 'groups' && groupsMode && (
            <SessionGroupsEditor
              students={assignmentStudents}
              keyGroups={keyGroups}
              absentIds={absentIds}
              existingMembers={existingMembers}
              isSubmitting={isSubmitting}
              onBack={() => setPageState('attendance')}
              onConfirm={handleAssignmentConfirmed}
            />
          )}

          {pageState === 'queue' && sessionId && answerKey && (
            <GradingQueue
              sessionId={sessionId}
              students={queueStudents}
              groups={groupViews}
              onComplete={handleQueueComplete}
              onStudentSkipped={handleStudentSkipped}
            />
          )}

          {pageState === 'results' && sessionId && <GradingResults sessionId={sessionId} />}
        </main>
      </div>
    </div>
  );
}
