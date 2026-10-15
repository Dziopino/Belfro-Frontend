import { useEffect, useState, type FormEvent } from 'react';
import { answerKeysAPI } from '../services/apiService';
import type { AnswerKeySummary } from '../types';
import Sidebar from '../components/Sidebar';
import HeaderAccount from '../components/HeaderAccount';
import AnswerKeyVariantsEditor, {
  singleVariant,
  variantsFromRecord,
  validateVariants,
  variantsPayload,
  type EditorVariant,
} from '../components/AnswerKeyVariantsEditor';
import { pluralPolish } from '../utils/polish';
import { Search, Bell, Plus, Trash2, Edit2, Save, X, KeyRound, ListChecks, Award, History, Layers } from 'lucide-react';
import { apiErrorMessage } from '../utils/apiError';

/** Polska odmiana po liczebniku: 1 zadanie, 2-4 zadania, 5+ zadań. */
function tasksWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'zadanie';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'zadania';
  return 'zadań';
}

/** „użyty w 1 sesji” / „użyty w 3 sesjach”. */
function sessionsWord(count: number): string {
  return count % 10 === 1 && count % 100 !== 11 ? 'sesji' : 'sesjach';
}

export default function AnswerKeysPage() {
  const [answerKeys, setAnswerKeys] = useState<AnswerKeySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Stan formularza tworzenia/edycji
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Zmienia się przy każdym otwarciu formularza, żeby edytor startował od świeżych wierszy
  const [formSession, setFormSession] = useState(0);

  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formVariants, setFormVariants] = useState<EditorVariant[]>([singleVariant()]);
  const [editorSeed, setEditorSeed] = useState<EditorVariant[]>([singleVariant()]);

  // Dwustopniowe potwierdzenie usunięcia w miejscu okna dialogowego przeglądarki
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadAnswerKeys();
  }, []);

  const loadAnswerKeys = async () => {
    try {
      setIsLoading(true);
      setError('');
      const { answer_keys } = await answerKeysAPI.getAnswerKeys();
      setAnswerKeys(answer_keys);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się załadować kluczy odpowiedzi'));
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateForm = () => {
    const seed = [singleVariant()];
    setIsEditing(false);
    setEditingId(null);
    setFormName('');
    setFormSubject('');
    setFormVariants(seed);
    setEditorSeed(seed);
    setFormSession((session) => session + 1);
    setShowForm(true);
  };

  const openEditForm = async (key: AnswerKeySummary) => {
    try {
      setError('');
      const { answer_key } = await answerKeysAPI.getAnswerKey(key.id);
      const seed = variantsFromRecord(answer_key);

      setIsEditing(true);
      setEditingId(answer_key.id);
      setFormName(answer_key.name);
      setFormSubject(answer_key.subject ?? '');
      setFormVariants(seed);
      setEditorSeed(seed);
      setFormSession((session) => session + 1);
      setShowForm(true);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się otworzyć klucza'));
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setConfirmDeleteId(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const tasksError = validateVariants(formVariants);
    if (tasksError) {
      setError(tasksError);
      return;
    }

    setIsSaving(true);

    const payload = {
      name: formName.trim(),
      subject: formSubject.trim() || null,
      ...variantsPayload(formVariants),
    };

    try {
      if (isEditing && editingId) {
        await answerKeysAPI.updateAnswerKey(editingId, payload);
      } else {
        await answerKeysAPI.createAnswerKey(payload);
      }

      await loadAnswerKeys();
      closeForm();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się zapisać klucza'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setError('');
      await answerKeysAPI.deleteAnswerKey(id);
      setConfirmDeleteId(null);
      await loadAnswerKeys();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się usunąć klucza'));
    }
  };

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: '#0B0F19' }}>
      <Sidebar />

      <div className="flex-1 w-full min-w-0 lg:ml-64">
        {/* Header */}
        <header className="h-14 sm:h-16 bg-[#131B2E] border-b border-slate-800/60 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-10">
          {/* Mobile: rezerwujemy miejsce na hamburger, który jest fixed top-3 left-4 */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="lg:hidden flex items-center gap-3 pl-12">
              <div className="font-bold text-slate-100 text-sm leading-none">BELFRO.PL</div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 ml-auto shrink-0">
            <button
              className="hidden sm:inline-flex p-2 rounded-xl hover:bg-slate-800/50 transition-colors cursor-pointer min-h-11 min-w-11 items-center justify-center"
              title="Szukaj klucza"
              aria-label="Szukaj klucza"
            >
              <Search className="w-5 h-5 text-slate-400" aria-hidden="true" />
            </button>
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

        <main id="main-content" tabIndex={-1} className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 mx-auto w-full max-w-6xl">
          {/* Page Title + CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Klucze odpowiedzi</h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Zapisz klucze swoich sprawdzianów i wybieraj je podczas sprawdzania prac
              </p>
            </div>

            {!showForm && (
              <button
                onClick={openCreateForm}
                className="inline-flex items-center justify-center gap-2 self-start sm:self-auto px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors cursor-pointer min-h-11 font-medium"
              >
                <Plus className="w-5 h-5" aria-hidden="true" />
                Dodaj nowy klucz
              </button>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 sm:p-4 bg-rose-950/40 border border-rose-800/50 rounded-xl" role="alert">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}

          {/* Form */}
          {showForm && (
            <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6 w-full">
              <div className="flex items-start justify-between gap-3 mb-4">
                <h2 className="text-lg sm:text-xl font-bold text-slate-100 min-w-0 break-words">
                  {isEditing ? 'Edytuj klucz odpowiedzi' : 'Nowy klucz odpowiedzi'}
                </h2>
                <button
                  onClick={closeForm}
                  className="shrink-0 -mt-2 -mr-2 p-2 rounded-xl hover:bg-slate-800/50 transition-colors cursor-pointer min-h-11 min-w-11 flex items-center justify-center"
                  title="Zamknij"
                  aria-label="Zamknij formularz"
                >
                  <X className="w-5 h-5 text-slate-400" aria-hidden="true" />
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-5 sm:mb-6">
                  <div>
                    <label htmlFor="answer-key-name" className="block text-sm font-medium text-slate-300 mb-2">
                      Nazwa klucza
                    </label>
                    <input
                      id="answer-key-name"
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                      placeholder="np. Sprawdzian 3 — potęgi"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="answer-key-subject" className="block text-sm font-medium text-slate-300 mb-2">
                      Przedmiot (opcjonalnie)
                    </label>
                    <input
                      id="answer-key-subject"
                      type="text"
                      value={formSubject}
                      onChange={(e) => setFormSubject(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                      placeholder="np. Matematyka"
                    />
                  </div>
                </div>

                <AnswerKeyVariantsEditor
                  key={formSession}
                  initialVariants={editorSeed}
                  onChange={setFormVariants}
                />

                <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 sm:justify-end mt-6">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="inline-flex items-center justify-center px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer min-h-11 disabled:opacity-50 font-medium"
                    disabled={isSaving}
                  >
                    Anuluj
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer min-h-11 font-medium"
                    disabled={isSaving}
                  >
                    <Save className="w-5 h-5" aria-hidden="true" />
                    {isSaving ? 'Zapisywanie…' : 'Zapisz klucz'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5 animate-pulse motion-reduce:animate-none"
                >
                  <div className="h-5 w-2/3 rounded bg-slate-800" />
                  <div className="mt-3 h-3.5 w-1/3 rounded bg-slate-800/80" />
                  <div className="mt-4 flex gap-2">
                    <div className="h-6 w-16 rounded-lg bg-slate-800/60" />
                    <div className="h-6 w-14 rounded-lg bg-slate-800/60" />
                  </div>
                  <div className="mt-4 h-3 w-1/2 rounded bg-slate-800/60" />
                </div>
              ))}
              <p className="sr-only">Ładowanie kluczy odpowiedzi</p>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && answerKeys.length === 0 && !showForm && (
            <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-8 sm:p-12 text-center">
              <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <KeyRound className="w-7 h-7 text-blue-400" aria-hidden="true" />
              </div>
              <h2 className="text-base sm:text-lg font-semibold text-slate-100">
                Nie masz jeszcze żadnego klucza
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
                Dodaj klucz raz, a przy kolejnym sprawdzaniu tego samego sprawdzianu tylko go wybierz
                — nie będziesz go przepisywać od nowa.
              </p>
              <button
                onClick={openCreateForm}
                className="mt-6 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors cursor-pointer min-h-11 font-medium"
              >
                <Plus className="w-5 h-5" aria-hidden="true" />
                Dodaj pierwszy klucz
              </button>
            </div>
          )}

          {/* Answer Keys List */}
          {!isLoading && answerKeys.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              {answerKeys.map((key) => (
                <article
                  key={key.id}
                  className="flex h-full flex-col bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5 transition-colors hover:border-slate-700/70"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-slate-100 break-words">{key.name}</h3>
                      <p className="text-xs font-medium text-blue-400 mt-1 min-h-[1rem] break-words">
                        {key.subject ?? ''}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0 -mt-1.5 -mr-1.5">
                      <button
                        onClick={() => openEditForm(key)}
                        className="p-2 rounded-xl hover:bg-slate-800/60 transition-colors cursor-pointer min-h-11 min-w-11 flex items-center justify-center"
                        title={`Edytuj klucz ${key.name}`}
                        aria-label={`Edytuj klucz ${key.name}`}
                      >
                        <Edit2 className="w-5 h-5 text-blue-400" aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(key.id)}
                        className="p-2 rounded-xl hover:bg-rose-500/20 transition-colors cursor-pointer min-h-11 min-w-11 flex items-center justify-center"
                        title={`Usuń klucz ${key.name}`}
                        aria-label={`Usuń klucz ${key.name}`}
                      >
                        <Trash2 className="w-5 h-5 text-rose-400" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/60 px-2 py-1 text-xs font-medium text-slate-300">
                      <ListChecks className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                      <span className="tabular-nums">
                        {key.tasks_count} {tasksWord(key.tasks_count)}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/60 px-2 py-1 text-xs font-medium text-slate-300">
                      <Award className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                      <span className="tabular-nums">{key.total_points} pkt</span>
                    </span>
                    {key.groups_count > 0 && (
                      <span
                        title={key.groups.map((group) => `${group.name}: ${group.total_points} pkt`).join(', ')}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800/60 px-2 py-1 text-xs font-medium text-slate-300"
                      >
                        <Layers className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        <span className="tabular-nums">
                          {key.groups_count} {pluralPolish(key.groups_count, 'grupa', 'grupy', 'grup')}
                        </span>
                      </span>
                    )}
                    {key.sessions_count > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400">
                        <History className="w-3.5 h-3.5" aria-hidden="true" />
                        <span className="tabular-nums">
                          użyty w {key.sessions_count} {sessionsWord(key.sessions_count)}
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="mt-auto pt-4">
                    <p className="text-xs text-slate-400 tabular-nums">
                      Utworzono: <time dateTime={key.created_at}>{new Date(key.created_at).toLocaleDateString('pl-PL')}</time>
                    </p>

                    {confirmDeleteId === key.id && (
                      <div className="mt-3 p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl">
                        <p className="text-sm text-rose-200">
                          Usunąć ten klucz z biblioteki? Sprawdzone prace zachowają swoje oceny.
                        </p>
                        <div className="mt-3 flex gap-2 justify-end">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg transition-colors text-sm cursor-pointer min-h-11"
                          >
                            Anuluj
                          </button>
                          <button
                            onClick={() => handleDelete(key.id)}
                            className="px-3 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-sm cursor-pointer min-h-11 font-medium"
                          >
                            Tak, usuń
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
