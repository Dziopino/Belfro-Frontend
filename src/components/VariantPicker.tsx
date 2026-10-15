import { useState } from 'react';
import { gradingAPI } from '../services/apiService';
import { variantAwaitingChoice, variantForGrade } from '../utils/grading';
import { pluralPolish } from '../utils/polish';
import { AlertTriangle, CheckCircle2, Save } from 'lucide-react';
import type { Grade, GradingSession } from '../types';
import { apiErrorMessage } from '../utils/apiError';

/**
 * Wskazanie wariantu arkusza w sesji, w której rozpoznawało go AI. Zmiana kasuje dotychczasowy
 * wynik i liczy pracę od nowa z kluczem wybranego wariantu, więc to jedyny control, który u nas
 * schodzi na salda stron — dlatego mówi o tym otwarcie, zanim nauczyciel kliknie.
 */
export default function VariantPicker({
  sessionId,
  session,
  grade,
  onRegraded
}: {
  sessionId: string;
  session: GradingSession;
  grade: Grade;
  onRegraded: () => void;
}) {
  const variants = session.answer_key_variants ?? [];
  const current = variantForGrade(session, grade);
  const [selected, setSelected] = useState(current?.name ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const unchanged = current !== null && selected === current.name;
  // Praca bez wyniku nie ma czego kasować i żadna strona za nią jeszcze nie zeszła.
  const awaitingResult = grade.final_points === null;

  /**
   * Dlaczego wariantu tej pracy nadal nie ma. Znacznik 'unresolved' znaczy, że model kartkę widział i
   * nie rozstrzygnął — wtedy wyjściem jest wyłącznie kliknięcie nauczyciela. Bez znacznika rozpoznanie
   * albo jeszcze nie leciało, albo padło na błędzie API, więc wróci samo przy najbliższym sprawdzaniu
   * sesji. Powód trzyma `variant_note`, bo bez niego nauczyciel widziałby pracę bez wyjaśnienia, a
   * jedyny ślad zostałby w logu procesu.
   */
  const pendingCopy = (): string => {
    const note = grade.variant_note?.trim();

    if (variantAwaitingChoice(grade)) {
      return `AI rozpoznało ten skan, ale nie ustaliło wariantu${note ? ` (powód: ${note})` : ''}, więc praca czeka na Twoje wskazanie.`;
    }

    return note
      ? `Rozpoznawanie wariantu tej pracy nie doszło do skutku (powód: ${note}). Spróbujemy ponownie przy najbliższym sprawdzaniu sesji, ale możesz wskazać wariant już teraz.`
      : 'Wariant tej pracy nie jest jeszcze rozpoznany. Rozpoznamy go przy najbliższym sprawdzaniu sesji, ale możesz wskazać wariant już teraz.';
  };

  const save = async () => {
    if (!selected || unchanged) return;

    setError('');
    setMessage('');

    try {
      setIsSaving(true);
      await gradingAPI.updateGrade(sessionId, grade.id, { variant_name: selected });
      setMessage('Wariant zapisany, praca sprawdzona od nowa');
      onRegraded();
    } catch (err: any) {
      const code = err.response?.data?.code;
      if (code === 'PAGE_LIMIT_EXCEEDED') {
        setError('Brak stron na koncie. Wariant zostawiony bez zmiany — doładuj saldo i spróbuj ponownie.');
      } else if (code === 'VARIANT_GRADE_FAILED') {
        setError('Wariant zapisany, ale sprawdzanie nie wyszło. Uruchom sprawdzanie sesji jeszcze raz.');
        onRegraded();
      } else {
        setError(apiErrorMessage(err, 'Nie udało się zapisać wariantu'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (variants.length === 0) return null;

  return (
    <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5">
      <h2 className="text-base sm:text-lg font-bold text-slate-100">Wariant arkusza tej pracy</h2>
      <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
        {current
          ? grade.variant_source === 'teacher'
            ? `Wariant ${current.name} wskazany przez Ciebie.`
            : `AI rozpoznał wariant ${current.name}.`
          : pendingCopy()}
      </p>

      <div className="mt-4 space-y-2" role="radiogroup" aria-label="Wariant arkusza">
        {variants.map((variant) => {
          const isSelected = variant.name === selected;
          return (
            <label
              key={variant.name}
              className={`flex items-start gap-3 p-3 rounded-xl border border-slate-800/60 bg-slate-900/50 cursor-pointer ${
                isSelected ? 'border-blue-500/60' : ''
              }`}
            >
              <input
                type="radio"
                name="work-sheet-variant"
                value={variant.name}
                checked={isSelected}
                onChange={() => {
                  setSelected(variant.name);
                  setMessage('');
                }}
                className="mt-0.5 w-5 h-5 shrink-0 accent-blue-600 cursor-pointer"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-200">{variant.name}</span>
                <span className="block text-xs text-slate-400 mt-0.5 tabular-nums">
                  {variant.answer_key.total_points.toLocaleString('pl-PL')} pkt •{' '}
                  {variant.answer_key.tasks.length} {pluralPolish(variant.answer_key.tasks.length, 'zadanie', 'zadania', 'zadań')}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl" role="alert">
          <p className="text-sm text-rose-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            {error}
          </p>
        </div>
      )}

      {message && !error && (
        <div className="mt-4 p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-xl" role="status">
          <p className="text-sm text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            {message}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-xs text-slate-400 leading-relaxed max-w-prose">
          {unchanged
            ? 'Wybrany wariant jest już zapisany przy tej pracy.'
            : awaitingResult
              ? 'Ta praca nie ma jeszcze wyników, więc wskazanie niczego nie nadpisze i nie pobiera strony.'
              : 'Wskazany wariant kasuje dotychczasowy wynik, także Twoje poprawki, i pobiera jedną stronę z salda.'}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={isSaving || unchanged || !selected}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors cursor-pointer min-h-11 font-medium disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <Save className="w-5 h-5" aria-hidden="true" />
          {isSaving ? 'Sprawdzanie pracy…' : 'Wskaż wariant i sprawdź'}
        </button>
      </div>
    </div>
  );
}
