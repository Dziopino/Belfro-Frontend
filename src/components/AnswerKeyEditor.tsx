import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { AnswerKey, AnswerKeyRecord, AnswerKeySubItem, AnswerKeyTask } from '../types';

// Id jest numerem porządkowym zadania („Zadanie 3"), tak jak w kreatorze sprawdzania.
// Serwer i tak zapisuje je jako tekst.
export interface EditorTask {
  id: number;
  max_points: number;
  correct_answer: string;
  guidelines: string;
  // Pusta tablica = zadanie oceniane jedną liczbą punktów. Edytor trzyma to pole zawsze, żeby
  // przełączanie podpunktów nie wymagało usuwania i dostawania klucza.
  sub_items: EditorSubItem[];
}

/**
 * Podpunkt w edytorze. `uid` istnieje tylko dla Reacta — litery, które widzi nauczyciel i serwer,
 * wynikają z kolejności, więc usunięcie środkowego podpunktu nie zostawia dziury w alfabcie.
 */
export interface EditorSubItem {
  uid: string;
  max_points: number;
  correct_answer: string;
}

interface AnswerKeyEditorProps {
  initialTasks?: EditorTask[];
  onChange: (tasks: EditorTask[]) => void;
}

// Ten sam limit co w `normalizeTasks` po stronie serwera.
export const SUB_ITEMS_MAX_COUNT = 20;

let uidCounter = 0;

function nextSubUid(): string {
  uidCounter += 1;
  return `sub-${uidCounter}`;
}

/** a, b, c… — etykieta w edytorze i `id` podpunktu wysyłany na serwer. */
export function subItemLabel(index: number): string {
  return String.fromCharCode(97 + Math.min(index, 25));
}

function roundPoints(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Punkty zadania: z podpunktami to ich suma, bez nich wartość wpisana. Serwer liczy dokładnie to
 * samo (answerKeyController.normalizeTasks), dlatego formularz nigdy nie ufa własnemu polu.
 */
export function taskMaxPoints(task: EditorTask): number {
  if (task.sub_items.length === 0) return task.max_points;
  return roundPoints(task.sub_items.reduce((sum, sub) => sum + sub.max_points, 0));
}

export function tasksTotalPoints(tasks: EditorTask[]): number {
  return roundPoints(tasks.reduce((sum, task) => sum + taskMaxPoints(task), 0));
}

function emptySubItem(maxPoints: number): EditorSubItem {
  return { uid: nextSubUid(), max_points: maxPoints, correct_answer: '' };
}

export function emptyTask(id: number): EditorTask {
  return { id, max_points: 5, correct_answer: '', guidelines: '', sub_items: [] };
}

/**
 * Ten sam zestaw reguł, który obowiązował w kreatorze sprawdzania, rozszerzony o podpunkty.
 * Zwraca gotowy komunikat dla nauczyciela albo pusty string, gdy wszystko jest w porządku.
 */
export function validateEditorTasks(tasks: EditorTask[]): string {
  for (const task of tasks) {
    if (task.sub_items.length === 0) {
      if (!task.correct_answer.trim()) {
        return `Zadanie ${task.id}: Musisz podać poprawną odpowiedź`;
      }
      if (!(task.max_points > 0)) {
        return `Zadanie ${task.id}: Maksymalna liczba punktów musi być większa niż 0`;
      }
      continue;
    }

    // Odpowiedź samego zadania schodzi wtedy do roli notatki — liczy się to, co przy podpunkcie.
    for (let index = 0; index < task.sub_items.length; index++) {
      const sub = task.sub_items[index];
      const label = `Zadanie ${task.id}, podpunkt ${subItemLabel(index)}`;

      if (!sub.correct_answer.trim()) {
        return `${label}: Musisz podać poprawną odpowiedź`;
      }
      if (!(sub.max_points > 0)) {
        return `${label}: Punkty muszą być większe niż 0`;
      }
    }

    if (taskMaxPoints(task) > 1000) {
      return `Zadanie ${task.id}: Suma punktów podpunktów przekracza 1000`;
    }
  }
  return '';
}

export function toAnswerKeyPayload(tasks: EditorTask[]) {
  return tasks.map((task) => {
    const subItems: AnswerKeySubItem[] = task.sub_items.map((sub, index) => ({
      id: subItemLabel(index),
      max_points: sub.max_points,
      correct_answer: sub.correct_answer.trim(),
    }));

    return {
      id: task.id,
      // Przy podpunktach serwer i tak przelicza tę wartość z ich sumy; wysyłamy ją tylko po to,
      // żeby klient i serwer widzieli tę samą liczbę w podsumowaniu.
      max_points: taskMaxPoints(task),
      correct_answer: task.correct_answer.trim(),
      guidelines: task.guidelines.trim() || undefined,
      ...(subItems.length > 0 ? { sub_items: subItems } : {}),
    };
  });
}

export function editorTasksFromTasks(tasks: AnswerKeyTask[]): EditorTask[] {
  return tasks.map((task, index) => ({
    id: Number(task.id) || index + 1,
    max_points: task.max_points,
    correct_answer: task.correct_answer,
    guidelines: task.guidelines ?? '',
    sub_items: (task.sub_items ?? []).map((sub) => ({
      uid: nextSubUid(),
      max_points: sub.max_points,
      correct_answer: sub.correct_answer,
    })),
  }));
}

/**
 * Klucz z biblioteki -> payload dla sesji sprawdzania. Backend zamraża tę kopię w sesji,
 * więc późniejsza edycja klucza nie zmienia już sprawdzonych prac.
 */
export function answerKeyFromRecord(record: AnswerKeyRecord): AnswerKey {
  return {
    total_points: record.total_points,
    tasks: record.tasks.map((task, index) => ({
      id: Number(task.id) || index + 1,
      max_points: task.max_points,
      correct_answer: task.correct_answer,
      guidelines: task.guidelines || undefined,
      ...(task.sub_items && task.sub_items.length > 0 ? { sub_items: task.sub_items } : {}),
    })),
  };
}

/**
 * Współdzielony edytor wierszy zadań klucza odpowiedzi — używany na stronie biblioteki
 * i w kreatorze sprawdzania, żeby jedna zmiana nie wymagała przerabiania dwóch miejsc.
 */
export default function AnswerKeyEditor({ initialTasks, onChange }: AnswerKeyEditorProps) {
  const [tasks, setTasks] = useState<EditorTask[]>(
    initialTasks && initialTasks.length > 0 ? initialTasks : [emptyTask(1)]
  );

  const applyChange = (next: EditorTask[]) => {
    setTasks(next);
    onChange(next);
  };

  const addTask = () => {
    const nextId = tasks.reduce((max, task) => Math.max(max, task.id), 0) + 1;
    applyChange([...tasks, emptyTask(nextId)]);
  };

  const removeTask = (id: number) => {
    if (tasks.length === 1) {
      return;
    }
    applyChange(tasks.filter((task) => task.id !== id));
  };

  const updateTask = (
    id: number,
    field: 'max_points' | 'correct_answer' | 'guidelines',
    value: string | number
  ) => {
    applyChange(
      tasks.map((task) => (task.id === id ? { ...task, [field]: value } : task))
    );
  };

  // Pierwszy podpunkt przejmuje punktację zadania: nauczyciel, który rozbija już wpisane „4 pkt"
  // na cztery odpowiedzi, nie musi ich przepisywać od nowa.
  const addSubItem = (id: number) => {
    applyChange(
      tasks.map((task) => {
        if (task.id !== id) return task;
        if (task.sub_items.length >= SUB_ITEMS_MAX_COUNT) return task;

        const stake = task.sub_items.length === 0 ? task.max_points : 1;
        return { ...task, sub_items: [...task.sub_items, emptySubItem(stake)] };
      })
    );
  };

  const removeSubItem = (id: number, uid: string) => {
    applyChange(
      tasks.map((task) =>
        task.id === id ? { ...task, sub_items: task.sub_items.filter((sub) => sub.uid !== uid) } : task
      )
    );
  };

  const updateSubItem = (id: number, uid: string, field: 'max_points' | 'correct_answer', value: string | number) => {
    applyChange(
      tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              sub_items: task.sub_items.map((sub) => (sub.uid === uid ? { ...sub, [field]: value } : sub)),
            }
          : task
      )
    );
  };

  const totalPoints = tasksTotalPoints(tasks);

  return (
    <div>
      <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="bg-slate-900/50 border border-slate-800/60 rounded-xl p-4 sm:p-5"
          >
            <div className="flex justify-between items-start mb-3 sm:mb-4">
              <h3 className="text-base sm:text-lg font-semibold text-slate-100">
                Zadanie {task.id}
              </h3>
              {tasks.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTask(task.id)}
                  className="shrink-0 p-2 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer min-h-11 min-w-11 flex items-center justify-center"
                  title={`Usuń zadanie ${task.id}`}
                  aria-label={`Usuń zadanie ${task.id}`}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="sm:col-span-1">
                <label
                  htmlFor={`task-points-${task.id}`}
                  className="block text-sm font-medium text-slate-300 mb-2"
                >
                  Max punktów
                </label>
                <input
                  id={`task-points-${task.id}`}
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  value={task.sub_items.length > 0 ? taskMaxPoints(task) : task.max_points}
                  readOnly={task.sub_items.length > 0}
                  title={
                    task.sub_items.length > 0
                      ? 'Suma punktów podpunktów — wpisuj je przy podpunktach'
                      : undefined
                  }
                  onChange={(e) =>
                    updateTask(task.id, 'max_points', Number.parseFloat(e.target.value) || 0)
                  }
                  className={`w-full px-3 sm:px-4 py-2.5 sm:py-2.5 bg-[#1A2338] border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base tabular-nums ${
                    task.sub_items.length > 0
                      ? 'text-slate-400 cursor-default'
                      : 'text-slate-100'
                  }`}
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor={`task-answer-${task.id}`}
                  className="block text-sm font-medium text-slate-300 mb-2"
                >
                  {task.sub_items.length > 0 ? 'Wstęp do odpowiedzi (opcjonalnie)' : 'Poprawna odpowiedź *'}
                </label>
                <input
                  id={`task-answer-${task.id}`}
                  type="text"
                  value={task.correct_answer}
                  onChange={(e) => updateTask(task.id, 'correct_answer', e.target.value)}
                  placeholder={
                    task.sub_items.length > 0
                      ? 'np. Rozwiąż układ równań — odpowiedzi w podpunktach'
                      : 'np. 42, Paryż, 2x + 3 = 7'
                  }
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base"
                  required={task.sub_items.length === 0}
                />
              </div>
            </div>

            <div className="mt-3 sm:mt-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {task.sub_items.length > 0
                    ? `Podpunkty — oceniane osobno (${taskMaxPoints(task)} pkt)`
                    : 'Podpunkty'}
                </span>
                <button
                  type="button"
                  onClick={() => addSubItem(task.id)}
                  disabled={task.sub_items.length >= SUB_ITEMS_MAX_COUNT}
                  title={
                    task.sub_items.length >= SUB_ITEMS_MAX_COUNT
                      ? `Najwyżej ${SUB_ITEMS_MAX_COUNT} podpunktów`
                      : 'Dodaj podpunkt zadania'
                  }
                  aria-label={`Dodaj podpunkt do zadania ${task.id}`}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors cursor-pointer min-h-11 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Podpunkt
                </button>
              </div>

              {task.sub_items.length > 0 ? (
                <div className="space-y-2">
                  {task.sub_items.map((sub, index) => (
                    <div
                      key={sub.uid}
                      className="grid grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_2.75rem] items-center gap-2"
                    >
                      <span
                        className="text-sm font-medium text-slate-400 tabular-nums"
                        title="Litera podpunktu"
                      >
                        {subItemLabel(index)})
                      </span>
                      <input
                        type="text"
                        value={sub.correct_answer}
                        onChange={(e) =>
                          updateSubItem(task.id, sub.uid, 'correct_answer', e.target.value)
                        }
                        placeholder={`Odpowiedź podpunktu ${subItemLabel(index)}`}
                        aria-label={`Poprawna odpowiedź podpunktu ${subItemLabel(index)} zadania ${task.id}`}
                        className="w-full px-3 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm"
                        required
                      />
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        min="0"
                        value={sub.max_points}
                        onChange={(e) =>
                          updateSubItem(task.id, sub.uid, 'max_points', Number.parseFloat(e.target.value) || 0)
                        }
                        aria-label={`Punkty za podpunkt ${subItemLabel(index)} zadania ${task.id}`}
                        title="Punkty za ten podpunkt"
                        className="w-full px-2 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm tabular-nums"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => removeSubItem(task.id, sub.uid)}
                        title={`Usuń podpunkt ${subItemLabel(index)}`}
                        aria-label={`Usuń podpunkt ${subItemLabel(index)} zadania ${task.id}`}
                        className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Zadanie bez podpunktów oceniasz jedną liczbą punktów. Podpunkty dodawaj, gdy
                  sprawdzian ma w nim kilka odpowiedzi — wtedy AI przyznaje punkty osobno za każdą.
                </p>
              )}
            </div>

            <div className="mt-3 sm:mt-4">
              <label
                htmlFor={`task-guidelines-${task.id}`}
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Wytyczne dla AI (opcjonalnie)
              </label>
              <textarea
                id={`task-guidelines-${task.id}`}
                value={task.guidelines}
                onChange={(e) => updateTask(task.id, 'guidelines', e.target.value)}
                placeholder="np. Akceptuj warianty odpowiedzi…"
                rows={2}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none text-sm sm:text-base"
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addTask}
        className="mb-4 sm:mb-6 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-300 border border-slate-700 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer min-h-11"
      >
        <Plus className="w-5 h-5" />
        Dodaj zadanie
      </button>

      <div className="p-3 sm:p-4 bg-blue-950/40 border border-blue-800/50 rounded-xl">
        <div className="flex items-center justify-between mb-2 gap-3">
          <span className="text-sm font-medium text-slate-300">Łączna liczba zadań</span>
          <span className="text-base sm:text-lg font-bold text-blue-400 tabular-nums">
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-300">Maksymalna liczba punktów</span>
          <span className="text-base sm:text-lg font-bold text-blue-400 tabular-nums">
            {totalPoints}
          </span>
        </div>
      </div>
    </div>
  );
}
