import type {
  AnswerKey,
  Grade,
  GradeEntry,
  GradingSession,
  SessionAnswerKeyVariant,
  TaskCertainty,
} from '../types';

// Poniżej tej pewności AI praca domaga się oka nauczyciela. To próg UI, NIE próg
// eskalacji modelu (75 w backendowym aiGradingService).
export const LOW_CONFIDENCE_THRESHOLD = 70;

// Funkcja obliczająca ocenę na podstawie procentu punktów
export function calculateGrade(
  finalPoints: number | null,
  totalPoints: number,
  thresholds: GradeEntry[] | null
): string | null {
  if (finalPoints === null || totalPoints === 0) return null;
  if (!thresholds || thresholds.length === 0) return null;

  const percent = (finalPoints / totalPoints) * 100;

  // Skale są posortowane malejąco po min_percent
  for (const entry of thresholds) {
    if (percent >= entry.min_percent) {
      return entry.grade;
    }
  }

  return null;
}

/**
 * Podpunkt w wierszu karty pracy. Istnieje tylko wtedy, gdy klucz tej pracy rozbija zadanie na
 * a, b, c — punkty zadania są wtedy ich sumą, liczoną po stronie serwera.
 */
export type EffectiveSubItem = {
  id: string;
  points: number;
  max_points: number;
  /** Transkrypt tego podpunktu. Pusty dla wierszy po poprawce nauczyciela. */
  transcription: string;
  certainty: TaskCertainty | null;
  confidence: number | null;
};

export type EffectiveTask = {
  task_number: number;
  points: number;
  comment: string;
  edited: boolean;
  /** Co model odczytał z kartki. Pusty dla wierszy po poprawce — tam wynik nie pochodzi od modelu. */
  transcription: string;
  /** Etykieta pewności z odpowiedzi AI; null także dla starszych prac sprawdzanych przed tą zmianą. */
  certainty: TaskCertainty | null;
  /** 0-100 tego zadania, wyliczone w backendzie. Null, gdy brak etykiety albo wiersz poprawiony. */
  confidence: number | null;
  sub_items: EffectiveSubItem[];
};

/**
 * Polskie nazwy etykiet pewności zadania. Trzymane tutaj, bo karta pracy i każdy inny widok mają
 * mówić o tym samym ryzyku tymi samymi słowami.
 */
const CERTAINTY_LABELS: Record<TaskCertainty, string> = {
  certain: 'pewne',
  key_ambiguous: 'klucz nie rozstrzyga',
  reading_uncertain: 'możliwy inny odczyt',
  missing_evidence: 'brak dowodu',
};

export function certaintyLabel(certainty: TaskCertainty | null | undefined): string | null {
  if (!certainty) return null;
  return CERTAINTY_LABELS[certainty] ?? null;
}

/**
 * Wiersze zadań do wyświetlenia: poprawki nauczyciela mają priorytet nad odpowiedzią AI.
 * Toleruje puste `ai_response` (`{}` dla pracy przesłanej ponownie) — wtedy source = 'none'.
 */
export function resolveEffectiveTasks(grade: Grade): { tasks: EffectiveTask[]; source: 'teacher' | 'ai' | 'none' } {
  const teacherTasks = grade.teacher_response?.tasks;
  if (Array.isArray(teacherTasks) && teacherTasks.length > 0) {
    return {
      tasks: teacherTasks.map((task) => ({
        task_number: toNumber(task.task_number, 0),
        points: toNumber(task.points, 0),
        comment: toText(task.comment),
        edited: task.edited !== false,
        // Po ręcznej poprawce pewność AI opisuje punkty, których już nie ma w wyniku. Wolimy jej nie
        // pokazywać niż pokazać liczbę, która do tej kartki nie należy.
        transcription: '',
        certainty: null,
        confidence: null,
        sub_items: toSubItems(task.sub_items, false),
      })),
      source: 'teacher',
    };
  }

  const aiTasks = grade.ai_response?.tasks;
  if (Array.isArray(aiTasks) && aiTasks.length > 0) {
    return {
      tasks: aiTasks.map((task) => ({
        task_number: toNumber(task.task_number, 0),
        points: toNumber(task.points, 0),
        comment: toText(task.comment),
        edited: false,
        transcription: toText(task.transcription),
        certainty: toCertainty(task.certainty),
        confidence: toConfidence(task.confidence),
        sub_items: toSubItems(task.sub_items, true),
      })),
      source: 'ai',
    };
  }

  return { tasks: [], source: 'none' };
}

/**
 * Podpunkty wiersza. `withEvidence` mówi, czy źródłem jest model: transkrypt i etykieta są wtedy
 * jego odczytem, a po poprawce nauczyciela znikają — na tych samych zasadach co dla całego zadania.
 */
function toSubItems(value: unknown, withEvidence: boolean): EffectiveSubItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): EffectiveSubItem[] => {
    if (!entry || typeof entry !== 'object') return [];

    const raw = entry as Record<string, unknown>;
    const id = typeof raw.id === 'string' ? raw.id : typeof raw.id === 'number' ? String(raw.id) : '';
    if (!id) return [];

    return [
      {
        id,
        points: toNumber(raw.points, 0),
        max_points: toNumber(raw.max_points, 0),
        transcription: withEvidence ? toText(raw.transcription) : '',
        certainty: withEvidence ? toCertainty(raw.certainty) : null,
        confidence: withEvidence ? toConfidence(raw.confidence) : null,
      },
    ];
  });
}

function toConfidence(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toCertainty(value: unknown): TaskCertainty | null {
  switch (value) {
    case 'certain':
    case 'key_ambiguous':
    case 'reading_uncertain':
    case 'missing_evidence':
      return value;
    default:
      return null;
  }
}

/**
 * Klucz odpowiedzi właściwy dla danej pracy. W sesji grupowej każda grupa ma własną zamrożoną
 * migawkę, więc mianownik procentów i lista zadań idą za uczniem, nie za sesją. Fallback do
 * `session.answer_key` (też dla ucznia spoza każdej grupy) powtarza regułę backendowego
 * buildAnswerKeyResolver — bez niej ekran i AI pokazałyby dwie różne punktacje tej samej pracy.
 */
export function answerKeyForStudent(
  session: Pick<GradingSession, 'answer_key' | 'session_groups'> | null | undefined,
  studentId: string | null | undefined
): AnswerKey | null {
  if (!session) return null;

  const group = studentId
    ? session.session_groups?.find((candidate) => candidate.student_ids.includes(studentId))
    : undefined;

  return group?.answer_key ?? session.answer_key ?? null;
}

export function maxPointsForStudent(
  session: Pick<GradingSession, 'answer_key' | 'session_groups'> | null | undefined,
  studentId: string | null | undefined
): number {
  return answerKeyForStudent(session, studentId)?.total_points ?? 0;
}

/** Nazwa grupy ucznia — null, gdy sesja jest jednym kluczem albo pracy nie przydzielono grupy. */
export function groupNameForStudent(
  session: Pick<GradingSession, 'session_groups'> | null | undefined,
  studentId: string | null | undefined
): string | null {
  if (!session?.session_groups || !studentId) return null;
  return session.session_groups.find((group) => group.student_ids.includes(studentId))?.name ?? null;
}

type VariantSession = Pick<GradingSession, 'answer_key' | 'session_groups' | 'answer_key_variants'>;
type VariantGrade = Pick<Grade, 'student_id' | 'variant_name'>;

/** Sesja, w której wariant arkusza rozpoznaje model, a nie nauczyciel przy rozdawaniu. */
export function hasVariantDetection(
  session: Pick<GradingSession, 'answer_key_variants'> | null | undefined
): boolean {
  return (session?.answer_key_variants?.length ?? 0) > 0;
}

/**
 * Zamrożony wariant przydzielony tej pracy. Porównanie po znormalizowanej nazwie, bo zapisaną
 * nazwę zwraca model; w praktyce i tak zawsze wskazanie wychodzi z listy wariantów sesji.
 */
export function variantForGrade(
  session: Pick<VariantSession, 'answer_key_variants'> | null | undefined,
  grade: VariantGrade | null | undefined
): SessionAnswerKeyVariant | null {
  const variants = session?.answer_key_variants;
  const wanted = grade?.variant_name?.trim().toLowerCase();
  if (!variants || !wanted) return null;
  return variants.find((variant) => variant.name.trim().toLowerCase() === wanted) ?? null;
}

/**
 * Klucz tej pracy: wariant z rozpoznania > grupa z przydziału > klucz sesji. Ta sama kolejność
 * co w backendzie, więc procenty i lista zadań na ekranie liczonym z innego porządku nie mogłyby
 * się rozmijać z tym, czym AI naprawdę punktowało kartkę.
 */
export function answerKeyForGrade(
  session: VariantSession | null | undefined,
  grade: VariantGrade | null | undefined
): AnswerKey | null {
  return (
    variantForGrade(session, grade)?.answer_key ?? answerKeyForStudent(session, grade?.student_id)
  );
}

export function maxPointsForGrade(
  session: VariantSession | null | undefined,
  grade: VariantGrade | null | undefined
): number {
  return answerKeyForGrade(session, grade)?.total_points ?? 0;
}

/**
 * Etykieta wariantu do wyświetlenia: rozpoznana nazwa, a w sesji z przydziałem ręcznym nazwa grupy.
 * Null oznacza «nie wiadomo» i każe ekranowi wystawić własny napis, np. «do wskazania».
 */
export function variantLabelForGrade(
  session: VariantSession | null | undefined,
  grade: VariantGrade | null | undefined
): string | null {
  const variant = variantForGrade(session, grade);
  if (variant) return variant.name;
  if (hasVariantDetection(session)) return null;
  return groupNameForStudent(session, grade?.student_id);
}

/** Praca czekająca na wskazanie wariantu przez nauczyciela — bez wyników i bez pobranej strony. */
export function variantMissingForGrade(
  session: VariantSession | null | undefined,
  grade: VariantGrade | null | undefined
): boolean {
  return hasVariantDetection(session) && variantForGrade(session, grade) === null;
}

/**
 * Klasyfikacja tej pracy już się odbyła i nie rozstrzygnęła. Odróżnia ją od pracy, której /process
 * jeszcze nie widział: bez tego wznowione wyniki odpalałyby sprawdzanie przy każdym wejściu i płaciły
 * za tę samą klasyfikację raz za razem.
 */
export function variantAwaitingChoice(grade: Pick<Grade, 'variant_name' | 'variant_source'>): boolean {
  return !grade.variant_name && grade.variant_source === 'unresolved';
}

/**
 * Czy wariant tej pracy ma szansę rozstrzygnąć się sam. Nie, gdy klasyfikacja już raz nie
 * rozstrzygnęła (znacznik) albo gdy zapisana nazwa nie pasuje do żadnego wariantu sesji — to ostatnie
 * to dane uszkodzone i żaden przebieg /process ich nie naprawi. Bez znacznika i bez nazwy praca po
 * prostu czeka na najbliższe sprawdzanie sesji i nie wolno jej pokazywać jako «do wskazania».
 */
export function variantNeedsTeacher(
  session: VariantSession | null | undefined,
  grade: (VariantGrade & Pick<Grade, 'variant_source'>) | null | undefined
): boolean {
  if (!hasVariantDetection(session) || !grade) return false;
  if (!grade.variant_name) return grade.variant_source === 'unresolved';
  return variantForGrade(session, grade) === null;
}

type TitledSession = {
  name?: string | null;
  created_at: string;
  answer_key_ref?: { name: string } | null;
  answer_key_name?: string | null;
};

/**
 * Tytuł sesji dla historii i breadcrumbów. Najpierw zamrożona nazwa z chwili tworzenia sesji,
 * potem nazwa klucza z biblioteki (sesje sprzed migracji mają `name = null`), na końcu klasa i data.
 */
export function sessionTitle(session: TitledSession, decryptedClassName: string): string {
  const className = decryptedClassName || '—';

  return (
    session.name ||
    session.answer_key_ref?.name ||
    session.answer_key_name ||
    `Klasa ${className} · ${new Date(session.created_at).toLocaleDateString('pl-PL')}`
  );
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
