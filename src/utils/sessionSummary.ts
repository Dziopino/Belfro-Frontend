import {
  calculateGrade,
  groupNameForStudent,
  hasVariantDetection,
  resolveEffectiveTasks,
  sessionTitle,
  variantForGrade,
  variantNeedsTeacher,
} from './grading';
import type { SessionStudentGrade, SessionSummaryData, SessionTaskRow } from '../components/SessionSummaryTable';
import type { AnswerKey, Grade, GradingSession } from '../types';

/** Wiersz pracy z już odszyfrowanymi danymi ucznia — PII nigdy nie schodzi do stanu surowego. */
export interface DecryptedGrade extends Grade {
  student_name: string;
  student_number: string;
}

/** Wiersze klucza odpowiedzi są numerowane po `id`; gdy id nie jest liczbą, liczymy koleje. */
function taskNumberFromId(taskId: number | string, index: number): number {
  const asNumber = Number(taskId);
  return Number.isInteger(asNumber) ? asNumber : index + 1;
}

function toIsoDay(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

/**
 * Stan strony → kontrakt dla tabeli i generatorów PDF. Jedyne miejsce, gdzie wiadomo,
 * że poprawki nauczyciela nadpisują AI i że ocenę liczy calculateGrade, a nie model.
 */
export function buildSessionSummary(
  session: GradingSession,
  grades: DecryptedGrade[],
  className: string
): SessionSummaryData {
  const thresholds = session.grade_threshold?.thresholds ?? null;
  const groups = session.session_groups ?? [];
  const variants = session.answer_key_variants ?? [];
  const detectsVariants = hasVariantDetection(session);

  // Punktację liczy migawka klucza grupy albo rozpoznanego wariantu. Rekord `null` to klucz sesji —
  // on obsługuje sesję bez grupowania i pracę bez rozstrzygnięcia, dokładnie jak backend.
  type PointsSheet = { maxByNumber: Map<number, number>; total: number };
  const sheetFor = (answerKey: AnswerKey | null | undefined): PointsSheet => ({
    maxByNumber: new Map(
      (answerKey?.tasks ?? []).map((task, index) => [taskNumberFromId(task.id, index), task.max_points])
    ),
    total: answerKey?.total_points ?? 0,
  });

  const sheets = new Map<string | null, PointsSheet>([[null, sheetFor(session.answer_key)]]);
  for (const group of groups) sheets.set(group.name, sheetFor(group.answer_key));
  for (const variant of variants) sheets.set(variant.name, sheetFor(variant.answer_key));

  const rows: SessionStudentGrade[] = grades.map((grade) => {
    const variant = detectsVariants ? variantForGrade(session, grade) : null;
    const groupName = detectsVariants ? null : groupNameForStudent(session, grade.student_id);
    const sheet = sheets.get(variant?.name ?? groupName) ?? sheets.get(null)!;
    const effective = resolveEffectiveTasks(grade);
    const tasks: SessionTaskRow[] = effective.tasks.map((task) => ({
      name: `Zad ${task.task_number}`,
      points: task.points,
      maxPoints: sheet.maxByNumber.get(task.task_number) ?? 0,
      edited: task.edited,
    }));

    const aiFeedback = (grade.ai_response?.tasks ?? [])
      .map((task) => `Zad ${task.task_number}: ${task.comment}`)
      .join('\n');

    return {
      studentNumber: grade.student_number,
      studentName: grade.student_name,
      finalGrade: calculateGrade(grade.final_points, sheet.total, thresholds),
      finalPoints: grade.final_points,
      percentage:
        grade.final_points === null || sheet.total <= 0 ? null : (grade.final_points / sheet.total) * 100,
      aiResponseFeedback: aiFeedback,
      teacherResponse: grade.teacher_notes,
      tasks,
      verified: grade.manually_verified,
      confidenceScore: grade.confidence_score,
      gradeId: grade.id,
      groupName,
      variantName: variant?.name ?? null,
      variantMissing: variantNeedsTeacher(session, grade),
      maxPoints: sheet.total,
    };
  });

  return {
    sessionName: sessionTitle(session, className),
    className,
    sessionDate: toIsoDay(session.created_at),
    maxPoints: session.answer_key?.total_points ?? 0,
    thresholdName: session.grade_threshold?.name ?? null,
    groupNames: groups.map((group) => group.name),
    variantDetection: detectsVariants,
    variantNames: variants.map((variant) => variant.name),
    // Tryb listy bierzemy z klasy sesji, nie z treści wierszy. Bez dołączonej klasy zostaje układ
    // z nazwiskami: pary kolumn nie da się scalić na podstawie zgadywanki.
    numbered: session.class?.roster_mode === 'numbered',
    grades: rows,
  };
}

/**
 * Kolejność do przejrzenia przez nauczyciela: prace sprawdzone przed niesprawdzonymi, a w każdej
 * z tych grup najmniej pewne na górze.
 */
export function sortGradesForReview(grades: DecryptedGrade[]): DecryptedGrade[] {
  return grades.sort((a, b) => {
    const aChecked = a.final_points !== null;
    const bChecked = b.final_points !== null;
    if (aChecked !== bChecked) return aChecked ? -1 : 1;
    return a.confidence_score - b.confidence_score;
  });
}
