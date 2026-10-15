import { useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import AnswerKeyEditor, {
  editorTasksFromTasks,
  emptyTask,
  tasksTotalPoints,
  toAnswerKeyPayload,
  validateEditorTasks,
  type EditorTask,
} from './AnswerKeyEditor';
import { pluralPolish } from '../utils/polish';
import type {
  AnswerKeyGroupRecord,
  AnswerKeyGroupView,
  AnswerKeyRecord,
  CreateAnswerKeyRequest,
} from '../types';

export const GROUP_NAME_MAX_LENGTH = 30;
export const GROUPS_MAX_COUNT = 8;

/** Wariant w edytorze: nazwa grupy plus jej własne wiersze zadań. */
export interface EditorVariant {
  name: string;
  tasks: EditorTask[];
}

interface AnswerKeyVariantsEditorProps {
  initialVariants: EditorVariant[];
  onChange: (variants: EditorVariant[]) => void;
}

/** Nazwy po kolekcji alfabetu: „Grupa A", „Grupa B" — nauczyciel i tak może je zmienić. */
export function defaultVariantName(index: number): string {
  return `Grupa ${String.fromCharCode(65 + (index % 26))}`;
}

export function singleVariant(name = defaultVariantName(0)): EditorVariant {
  return { name, tasks: [emptyTask(1)] };
}

export function variantsFromRecord(record: AnswerKeyRecord): EditorVariant[] {
  const groups: AnswerKeyGroupRecord[] = record.groups ?? [];

  if (groups.length === 0) {
    // Klucz jednowariantowy: nazwa grupy istnieje tylko po to, żeby edytor miał co wyświetlić,
    // a do serwera i tak nie pójdzie (patrz variantsPayload).
    return [{ name: defaultVariantName(0), tasks: editorTasksFromTasks(record.tasks) }];
  }

  return groups
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((group) => ({ name: group.name, tasks: editorTasksFromTasks(group.tasks) }));
}

/**
 * Grupy do pokazania w kreatorze sprawdzania: nazwa i maksimum punktów wariantu.
 * Pusta tablica = klucz jednowariantowy, czyli sesja bez podziału na grupy.
 */
export function groupViewsFromRecord(record: AnswerKeyRecord): AnswerKeyGroupView[] {
  return (record.groups ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((group) => ({ name: group.name, total_points: group.total_points }));
}

/**
 * Reguły, których pilnuje też backend — dzięki temu nauczyciel dowiaduje się o nich przed
 * wysłaniem żądania, a nie po. Pojedynczy wariant nie ma nazwy do sprawdzenia.
 */
export function validateVariants(variants: EditorVariant[]): string {
  if (variants.length <= 1) {
    return variants[0] ? validateEditorTasks(variants[0].tasks) : 'Klucz musi zawierać co najmniej jedno zadanie';
  }

  const seen = new Set<string>();

  for (const variant of variants) {
    const name = variant.name.trim();

    if (!name) return 'Każda grupa musi mieć nazwę, np. „Grupa A"';
    if (name.length > GROUP_NAME_MAX_LENGTH) {
      return `Nazwa grupy „${name}" ma za dużo znaków — najwyżej ${GROUP_NAME_MAX_LENGTH}`;
    }

    const key = name.toLocaleLowerCase();
    if (seen.has(key)) return `Grupa „${name}" jest wymieniona dwa razy — nazwy muszą być różne`;
    seen.add(key);

    const tasksError = validateEditorTasks(variant.tasks);
    if (tasksError) return `${name}: ${tasksError}`;
  }

  return '';
}

/**
 * Payload zgodny z kontrolerem kluczy: jeden wariant to dawne płaskie `tasks`, kilka to `groups`.
 * Backend liczy kolumny klucza z pierwszego wariantu, więc ich nie wysyłamy.
 */
export function variantsPayload(variants: EditorVariant[]): Pick<CreateAnswerKeyRequest, 'tasks' | 'groups'> {
  if (variants.length <= 1) {
    return { tasks: toAnswerKeyPayload(variants[0]?.tasks ?? []) };
  }

  return {
    groups: variants.map((variant) => ({
      name: variant.name.trim(),
      tasks: toAnswerKeyPayload(variant.tasks),
    })),
  };
}

/**
 * Grupy w kluczu odpowiedzi. Nauczyciel, który nie chce wariantów, widzi dokładnie dawniejszy
 * edytor: jeden zestaw wierszy i przycisk dobierający drugą grupę.
 */
export default function AnswerKeyVariantsEditor({ initialVariants, onChange }: AnswerKeyVariantsEditorProps) {
  const seed = initialVariants.length > 0 ? initialVariants : [singleVariant()];
  const [variants, setVariants] = useState<EditorVariant[]>(seed);
  const [activeIndex, setActiveIndex] = useState(0);

  const applyChange = (next: EditorVariant[], nextActive = activeIndex) => {
    const bounded = Math.min(Math.max(nextActive, 0), Math.max(next.length - 1, 0));
    setVariants(next);
    setActiveIndex(bounded);
    onChange(next);
  };

  const active = variants[Math.min(activeIndex, variants.length - 1)];
  const hasGroups = variants.length > 1;

  const addVariant = () => {
    if (variants.length >= GROUPS_MAX_COUNT) return;

    // Nowa grupa startuje od kopii aktywnej: wariant B to zwykle ten sam sprawdzian z innymi
    // odpowiedziami, a przepisywanie zadań od nowa byłoby karą za podział klasy.
    const copy: EditorVariant = {
      name: nextFreeName(variants),
      tasks: active.tasks.map((task) => ({ ...task })),
    };

    applyChange([...variants, copy], variants.length);
  };

  const removeVariant = (index: number) => {
    if (variants.length <= 1) return;
    applyChange(variants.filter((_, i) => i !== index), index <= activeIndex ? index - 1 : activeIndex);
  };

  const renameVariant = (index: number, name: string) => {
    applyChange(variants.map((variant, i) => (i === index ? { ...variant, name } : variant)));
  };

  return (
    <div>
      {hasGroups && (
        <div className="mb-4 sm:mb-6">
          <div className="flex flex-wrap gap-2 mb-3">
            {variants.map((variant, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-pressed={isActive}
                  title={`Podgląd grupy: ${variant.name.trim() || defaultVariantName(index)}`}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors cursor-pointer min-h-11 ${
                    isActive
                      ? 'bg-blue-950/40 text-blue-300 border-blue-800/50'
                      : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  {variant.name.trim() || defaultVariantName(index)}
                  <span className="text-xs tabular-nums opacity-70">{tasksTotalPoints(variant.tasks)} pkt</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <label
                htmlFor={`variant-name-${activeIndex}`}
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Nazwa grupy
              </label>
              <input
                id={`variant-name-${activeIndex}`}
                type="text"
                value={active.name}
                maxLength={GROUP_NAME_MAX_LENGTH}
                onChange={(e) => renameVariant(activeIndex, e.target.value)}
                placeholder="np. Grupa A"
                className="w-full px-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>

            <div className="flex gap-2 sm:justify-end shrink-0">
              <button
                type="button"
                onClick={addVariant}
                disabled={variants.length >= GROUPS_MAX_COUNT}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors cursor-pointer min-h-11 disabled:opacity-50 disabled:cursor-not-allowed"
                title={`Dodaj kolejną grupę (max ${GROUPS_MAX_COUNT})`}
                aria-label="Dodaj kolejną grupę"
              >
                <Plus className="w-5 h-5" aria-hidden="true" />
                Grupa
              </button>
              <button
                type="button"
                onClick={() => removeVariant(activeIndex)}
                className="inline-flex items-center justify-center p-2.5 rounded-xl bg-slate-800/50 hover:bg-rose-500/20 border border-slate-700 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer min-h-11 min-w-11"
                title={`Usuń grupę: ${active.name.trim() || defaultVariantName(activeIndex)}`}
                aria-label="Usuń tę grupę"
              >
                <Trash2 className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      <AnswerKeyEditor
        // Zmiana grupy to nowy zestaw wierszy — bez tego klucza edytor zostałby przy starej tablicy.
        key={activeIndex}
        initialTasks={active.tasks}
        onChange={(tasks) =>
          applyChange(variants.map((variant, i) => (i === activeIndex ? { ...variant, tasks } : variant)))
        }
      />

      {!hasGroups && (
        <button
          type="button"
          onClick={addVariant}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors cursor-pointer min-h-11"
          title="Dodaj drugą grupę z własnym wariantem zadań"
          aria-label="Dodaj grupę"
        >
          <Copy className="w-5 h-5" aria-hidden="true" />
          Dodaj grupę (wariant zadań)
        </button>
      )}

      {!hasGroups && (
        <p className="mt-3 text-xs sm:text-sm text-slate-400 leading-relaxed">
          Grupa to osobny wariant tego samego sprawdzianu — własne odpowiedzi i własna suma punktów.
          Podczas sprawdzania przypisujesz uczniów do grup, więc nikt nie przepisuje od sąsiada.
        </p>
      )}

      {hasGroups && (
        <p className="mt-4 text-xs sm:text-sm text-slate-400 leading-relaxed">
          {variants.length} {pluralPolish(variants.length, 'grupa', 'grupy', 'grup')} w tym kluczu.
          Sesja sprawdzania weźmie z nich nazwy grup, a uczeń trafi do tej, którą wybierzesz na liście obecności.
        </p>
      )}
    </div>
  );
}

/** Pierwsza wolna nazwa z alfabetu — uczciwy domyślnik zamiast „Grupa A (2)". */
function nextFreeName(variants: EditorVariant[]): string {
  const taken = new Set(variants.map((variant) => variant.name.trim().toLocaleLowerCase()));

  for (let index = 0; index < GROUPS_MAX_COUNT; index++) {
    const candidate = defaultVariantName(index);
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }

  return `Grupa ${variants.length + 1}`;
}
