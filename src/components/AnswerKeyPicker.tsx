import { useEffect, useState, type FormEvent } from 'react';
import { answerKeysAPI } from '../services/apiService';
import { pluralPolish } from '../utils/polish';
import type { AnswerKey, AnswerKeyGroupView, AnswerKeySummary } from '../types';
import { answerKeyFromRecord, toAnswerKeyPayload, tasksTotalPoints } from './AnswerKeyEditor';
import { apiErrorMessage } from '../utils/apiError';
import AnswerKeyVariantsEditor, {
  groupViewsFromRecord,
  singleVariant,
  validateVariants,
  variantsPayload,
  type EditorVariant,
} from './AnswerKeyVariantsEditor';
import { ChevronRight, Layers, Plus, X } from 'lucide-react';

interface AnswerKeyPickerProps {
  /** Treść przycisku zatwierdzenia — kreator sesji idzie dalej, edytor grupy tylko zapisuje klucz */
  confirmLabel: string;
  /**
   * Trzeci argument to grupy (warianty) klucza — pusty, gdy klucz ma jedną wersję zadań.
   * Grupy zawsze idą w parze z `answerKeyId`: ich kluczy składamy z biblioteki po stronie serwera.
   */
  onConfirm: (answerKey: AnswerKey, answerKeyId: string | null, groups: AnswerKeyGroupView[]) => void;
  /** Bez tego przycisku nie ma — rodzic, który nie chce cofać, nie pokazuje okazji do wyjścia */
  onBack?: () => void;
  backLabel?: string;
  isSubmittingExternal?: boolean;
  title?: string;
  subtitle?: string;
}

type KeySource = 'library' | 'new';

/**
 * Wybór klucza odpowiedzi: lista z biblioteki albo wpisanie nowego, z opcją zapisania go w bibliotece.
 *
 * Klucz może mieć jedną wersję zadań albo kilka (Grupa A, B, C) — ten sam edytor co na stronie
 * biblioteki, więc nauczyciel nie uczy się dwóch interfejsów. Zwrócone `groups` mówią kreatorowi,
 * czy trzeba w ogóle dzielić klasę: pusta tablica to sprawdzian bez wariantów.
 * Backend sam zamienia klucz na snapshot, więc biblioteka może być edytowana bez ruszania już
 * sprawdzonych prac.
 */
export default function AnswerKeyPicker({
  confirmLabel,
  onConfirm,
  onBack,
  backLabel = 'Anuluj',
  isSubmittingExternal = false,
  title = 'Klucz odpowiedzi',
  subtitle = 'Wybierz zapisany klucz albo wpisz nowy dla tego sprawdzianu',
}: AnswerKeyPickerProps) {
  const [keys, setKeys] = useState<AnswerKeySummary[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [keySource, setKeySource] = useState<KeySource>('library');
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formVariants, setFormVariants] = useState<EditorVariant[]>([]);
  const [editorSeed, setEditorSeed] = useState<EditorVariant[]>([singleVariant()]);
  // Zmienia się przy każdym otwarciu formularza, żeby edytor startował od świeżych wierszy
  const [editorSession, setEditorSession] = useState(0);
  const [saveToLibrary, setSaveToLibrary] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Grupa bez klucza w bibliotece nie ma skąd wziąć wariantu zadań, więc przy więcej niż jednej
  // grupie zapis do biblioteki nie jest opcją do odznaczenia.
  const mustSaveLibrary = formVariants.length > 1;
  const willSaveLibrary = mustSaveLibrary || saveToLibrary;

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    try {
      setIsLoadingKeys(true);
      setError('');
      const { answer_keys } = await answerKeysAPI.getAnswerKeys();
      setKeys(answer_keys);
      if (answer_keys.length === 0) {
        setKeySource('new');
      }
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się załadować kluczy odpowiedzi'));
    } finally {
      setIsLoadingKeys(false);
    }
  };

  const openNewForm = () => {
    const seed = [singleVariant()];
    setEditorSeed(seed);
    setFormVariants(seed);
    setEditorSession((session) => session + 1);
    setKeySource('new');
  };

  const closeNewForm = () => {
    setKeySource('library');
    setFormName('');
    setFormSubject('');
    setFormVariants([]);
    setSaveToLibrary(true);
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (keySource === 'new') {
      const variantsError = validateVariants(formVariants);
      if (variantsError) {
        setError(variantsError);
        return;
      }
      if (willSaveLibrary && !formName.trim()) {
        setError(
          mustSaveLibrary
            ? 'Klucz z grupami zapisujemy w bibliotece — podaj jego nazwę'
            : 'Podaj nazwę klucza, żeby zapisać go w bibliotece'
        );
        return;
      }
    } else if (!selectedKeyId) {
      setError('Wybierz klucz z listy albo utwórz nowy');
      return;
    }

    setIsSubmitting(true);

    try {
      if (keySource === 'library' && selectedKeyId) {
        const { answer_key } = await answerKeysAPI.getAnswerKey(selectedKeyId);
        onConfirm(answerKeyFromRecord(answer_key), answer_key.id, groupViewsFromRecord(answer_key));
        return;
      }

      if (!willSaveLibrary) {
        const [variant] = formVariants;
        const tasks = toAnswerKeyPayload(variant?.tasks ?? []);
        onConfirm(
          {
            total_points: tasksTotalPoints(variant?.tasks ?? []),
            tasks,
          },
          null,
          []
        );
        return;
      }

      const { answer_key } = await answerKeysAPI.createAnswerKey({
        name: formName.trim(),
        subject: formSubject.trim() || null,
        ...variantsPayload(formVariants),
      });
      // Sesja mrożuje kopię klucza, więc późniejsza edycja biblioteki nie rusza sprawdzonych prac
      onConfirm(answerKeyFromRecord(answer_key), answer_key.id, groupViewsFromRecord(answer_key));
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się przygotować klucza odpowiedzi'));
      setIsSubmitting(false);
    }
  };

  const isBusy = isSubmitting || isSubmittingExternal;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-100 mb-2">{title}</h2>
        <p className="text-sm text-slate-400 mb-6">{subtitle}</p>

        {error && (
          <div className="mb-4 sm:mb-6 bg-rose-950/40 border border-rose-800/50 rounded-xl p-3 sm:p-4" role="alert">
            <p className="text-sm text-rose-400">{error}</p>
          </div>
        )}

        {isLoadingKeys ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin motion-reduce:animate-none rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-slate-400">Ładowanie kluczy…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {keys.length > 0 && (
              <div className="space-y-4 mb-4">
                {keys.map((key) => (
                  <label
                    key={key.id}
                    className="flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all"
                    style={{
                      backgroundColor:
                        keySource === 'library' && selectedKeyId === key.id ? '#1A2338' : 'transparent',
                      borderColor:
                        keySource === 'library' && selectedKeyId === key.id ? '#3B82F6' : '#374151',
                    }}
                  >
                    <input
                      type="radio"
                      name="answer-key"
                      checked={keySource === 'library' && selectedKeyId === key.id}
                      onChange={() => {
                        setSelectedKeyId(key.id);
                        setKeySource('library');
                        setError('');
                      }}
                      className="w-5 h-5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-100 font-medium break-words">{key.name}</p>
                      <p className="text-sm text-slate-400 break-words">
                        {key.subject ? `${key.subject} · ` : ''}
                        <span className="tabular-nums">
                          {key.tasks_count} {pluralPolish(key.tasks_count, 'zadanie', 'zadania', 'zadań')}
                        </span>
                        {' · '}
                        <span className="tabular-nums">{key.total_points} pkt</span>
                      </p>
                      {key.groups_count > 1 && (
                        <span
                          title={key.groups.map((group) => `${group.name}: ${group.total_points} pkt`).join(', ')}
                          className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-950/40 text-blue-400 border border-blue-800/50 tabular-nums"
                        >
                          <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                          {key.groups_count}{' '}
                          {pluralPolish(key.groups_count, 'grupa', 'grupy', 'grup')}
                        </span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {keySource !== 'new' ? (
              <button
                type="button"
                onClick={openNewForm}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-slate-500 hover:border-blue-500 hover:bg-[#1A2338] transition-all text-slate-400 hover:text-white cursor-pointer"
                style={{ minHeight: '44px' }}
              >
                <Plus className="w-5 h-5" />
                Utwórz nowy klucz
              </button>
            ) : (
              <div className="p-4 rounded-lg border-2 border-blue-500" style={{ backgroundColor: '#1A2338' }}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <h3 className="text-lg font-semibold text-slate-100 min-w-0 break-words">
                    {keys.length > 0 ? 'Nowy klucz odpowiedzi' : 'Klucz odpowiedzi'}
                  </h3>
                  {keys.length > 0 && (
                    <button
                      type="button"
                      onClick={closeNewForm}
                      className="shrink-0 -mt-2 -mr-2 p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer min-h-11 min-w-11 flex items-center justify-center"
                      title="Wróć do listy kluczy"
                      aria-label="Wróć do listy kluczy"
                    >
                      <X className="w-5 h-5 text-slate-400" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
                  <div>
                    <label htmlFor="session-key-name" className="block text-sm font-medium text-slate-300 mb-2">
                      Nazwa klucza {willSaveLibrary ? '' : '(opcjonalnie)'}
                    </label>
                    <input
                      id="session-key-name"
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg text-slate-100 placeholder-slate-400 bg-slate-900/50 border border-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                      placeholder="np. Sprawdzian 3 — potęgi"
                    />
                  </div>

                  <div>
                    <label htmlFor="session-key-subject" className="block text-sm font-medium text-slate-300 mb-2">
                      Przedmiot (opcjonalnie)
                    </label>
                    <input
                      id="session-key-subject"
                      type="text"
                      value={formSubject}
                      onChange={(e) => setFormSubject(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg text-slate-100 placeholder-slate-400 bg-slate-900/50 border border-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                      placeholder="np. Matematyka"
                    />
                  </div>
                </div>

                <AnswerKeyVariantsEditor
                  key={editorSession}
                  initialVariants={editorSeed}
                  onChange={setFormVariants}
                />

                <label
                  className={`mt-4 sm:mt-6 flex items-center gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-800 min-h-11 ${
                    mustSaveLibrary ? '' : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={willSaveLibrary}
                    disabled={mustSaveLibrary}
                    onChange={(e) => setSaveToLibrary(e.target.checked)}
                    className="w-5 h-5 shrink-0 accent-blue-500 disabled:cursor-not-allowed"
                  />
                  <span className="text-sm text-slate-300">
                    {mustSaveLibrary
                      ? 'Klucz z grupami zapisujemy w bibliotece — to z niego sesja bierze wariant każdej grupy'
                      : 'Zapisz ten klucz w bibliotece, żeby wybrać go przy kolejnym sprawdzaniu'}
                  </span>
                </label>
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 sm:justify-end">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  disabled={isBusy}
                  className="px-4 sm:px-6 py-2.5 bg-slate-700/50 hover:bg-slate-700 text-slate-200 font-medium rounded-xl transition-colors disabled:opacity-50 cursor-pointer min-h-11 text-sm sm:text-base"
                >
                  {backLabel}
                </button>
              )}
              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-h-11 text-sm sm:text-base"
              >
                {isBusy ? 'Przygotowywanie…' : confirmLabel}
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
