import { useState, useEffect } from 'react';
import { thresholdsAPI } from '../services/apiService';
import type { GradeThreshold, GradeEntry } from '../types';
import Sidebar from '../components/Sidebar';
import HeaderAccount from '../components/HeaderAccount';
import { Search, Bell, Plus, Trash2, Edit2, Save, X, Ruler, ListChecks } from 'lucide-react';
import { createDefaultGradeScale } from '../utils/grading';
import { apiErrorMessage } from '../utils/apiError';

/** Polska odmiana po liczebniku: 1 próg, 2-4 progi, 5+ progów. */
function entriesWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'próg';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'progi';
  return 'progów';
}

export default function GradeThresholdsPage() {
  const [thresholds, setThresholds] = useState<GradeThreshold[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Stan formularza tworzenia/edycji
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formName, setFormName] = useState('');
  const [formEntries, setFormEntries] = useState<GradeEntry[]>([
    { grade: '', min_percent: 0 },
    { grade: '', min_percent: 0 },
  ]);

  // Dwustopniowe potwierdzenie usunięcia w miejscu okna dialogowego przeglądarki — tak jak na kluczach odpowiedzi
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadThresholds();
  }, []);

  const loadThresholds = async () => {
    try {
      setIsLoading(true);
      setError('');
      const { thresholds: fetchedThresholds } = await thresholdsAPI.getThresholds();
      setThresholds(fetchedThresholds);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się załadować skal ocen'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNew = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormName('');
    setFormEntries([
      { grade: '', min_percent: 0 },
      { grade: '', min_percent: 0 },
    ]);
    setConfirmDeleteId(null);
    setShowForm(true);
  };

  const handleEdit = (threshold: GradeThreshold) => {
    setIsEditing(true);
    setEditingId(threshold.id);
    setFormName(threshold.name);
    setFormEntries([...threshold.thresholds]);
    setConfirmDeleteId(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setConfirmDeleteId(null);
  };

  const handleInsertDefault = () => {
    setFormEntries(createDefaultGradeScale());
  };

  const handleAddEntry = () => {
    if (formEntries.length < 6) {
      setFormEntries([...formEntries, { grade: '', min_percent: 0 }]);
    }
  };

  const handleRemoveEntry = (index: number) => {
    if (formEntries.length > 2) {
      setFormEntries(formEntries.filter((_, i) => i !== index));
    }
  };

  const handleEntryChange = (index: number, field: 'grade' | 'min_percent', value: string | number) => {
    const updated = [...formEntries];
    updated[index] = { ...updated[index], [field]: value };
    setFormEntries(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);

    try {
      if (isEditing && editingId) {
        await thresholdsAPI.updateThreshold(editingId, {
          name: formName,
          thresholds: formEntries,
        });
      } else {
        await thresholdsAPI.createThreshold({
          name: formName,
          thresholds: formEntries,
        });
      }

      await loadThresholds();
      closeForm();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się zapisać skali'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setError('');
      await thresholdsAPI.deleteThreshold(id);
      setConfirmDeleteId(null);
      await loadThresholds();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się usunąć skali'));
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
              title="Szukaj skali"
              aria-label="Szukaj skali"
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
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Progi ocen</h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Zarządzaj skalami oceniania dla swoich sprawdzianów
              </p>
            </div>

            {!showForm && (
              <button
                onClick={handleCreateNew}
                className="inline-flex items-center justify-center gap-2 self-start sm:self-auto px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors cursor-pointer min-h-11 font-medium"
              >
                <Plus className="w-5 h-5" aria-hidden="true" />
                Dodaj nową skalę
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
                  {isEditing ? 'Edytuj skalę' : 'Nowa skala ocen'}
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
                {/* Nazwa skali */}
                <div className="mb-4">
                  <label htmlFor="threshold-name" className="block text-sm font-medium text-slate-300 mb-2">
                    Nazwa skali
                  </label>
                  <input
                    id="threshold-name"
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    placeholder="np. Standardowa 1-6"
                    required
                  />
                </div>

                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Progi podajesz w procentach od 0 do 100. Kolejność wierszy nie ma znaczenia —
                  aplikacja sama ustawi je od najwyższego progu.
                </p>

                {/* Przyciski akcji */}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-5">
                  <button
                    type="button"
                    onClick={handleInsertDefault}
                    className="inline-flex items-center justify-center px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors text-sm cursor-pointer min-h-11 font-medium"
                  >
                    Wstaw typową skalę (1-6)
                  </button>
                  {formEntries.length < 6 && (
                    <button
                      type="button"
                      onClick={handleAddEntry}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl transition-colors text-sm cursor-pointer min-h-11 font-medium"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      Dodaj próg
                    </button>
                  )}
                </div>

                {/* Wpisy */}
                <div className="space-y-3 mb-5">
                  {formEntries.map((entry, index) => (
                    <div key={index} className="grid grid-cols-[4.5rem_1fr_auto] sm:grid-cols-[5rem_1fr_auto] items-end gap-2 sm:gap-3">
                      <div>
                        <label
                          htmlFor={`grade-${index}`}
                          className="block text-xs font-medium uppercase tracking-wide text-slate-400 mb-1.5"
                        >
                          Ocena
                        </label>
                        <input
                          id={`grade-${index}`}
                          type="text"
                          value={entry.grade}
                          onChange={(e) => handleEntryChange(index, 'grade', e.target.value)}
                          className="w-full px-2 sm:px-3 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-center tabular-nums"
                          placeholder="5"
                          required
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`percent-${index}`}
                          className="block text-xs font-medium uppercase tracking-wide text-slate-400 mb-1.5"
                        >
                          Min. procent
                        </label>
                        <input
                          id={`percent-${index}`}
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max="100"
                          value={entry.min_percent}
                          onChange={(e) => handleEntryChange(index, 'min_percent', parseInt(e.target.value) || 0)}
                          className="w-full px-3 sm:px-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors tabular-nums"
                          required
                        />
                      </div>
                      {formEntries.length > 2 ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveEntry(index)}
                          className="shrink-0 p-2 rounded-xl hover:bg-rose-500/20 transition-colors cursor-pointer min-h-11 min-w-11 flex items-center justify-center"
                          title={`Usuń próg ${index + 1}`}
                          aria-label={`Usuń próg ${index + 1}`}
                        >
                          <Trash2 className="w-5 h-5 text-rose-400" aria-hidden="true" />
                        </button>
                      ) : (
                        <span className="min-w-11" aria-hidden="true" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Podsumowanie skali */}
                <div className="p-3 sm:p-4 bg-blue-950/40 border border-blue-800/50 rounded-xl mb-6">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-300">Liczba stopni skali</span>
                    <span className="text-base sm:text-lg font-bold text-blue-400 tabular-nums">
                      {formEntries.length}
                    </span>
                  </div>
                </div>

                {/* Przyciski zapisu */}
                <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 sm:justify-end">
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
                    {isSaving ? 'Zapisywanie…' : 'Zapisz skalę'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5 animate-pulse motion-reduce:animate-none"
                >
                  <div className="h-5 w-1/2 rounded bg-slate-800" />
                  <div className="mt-3 h-3.5 w-1/4 rounded bg-slate-800/80" />
                  <div className="mt-4 space-y-1.5">
                    <div className="h-9 rounded-lg bg-slate-800/50" />
                    <div className="h-9 rounded-lg bg-slate-800/50" />
                    <div className="h-9 rounded-lg bg-slate-800/40" />
                  </div>
                </div>
              ))}
              <p className="sr-only">Ładowanie skal ocen</p>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && thresholds.length === 0 && !showForm && (
            <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-8 sm:p-12 text-center">
              <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Ruler className="w-7 h-7 text-blue-400" aria-hidden="true" />
              </div>
              <h2 className="text-base sm:text-lg font-semibold text-slate-100">
                Nie masz jeszcze żadnej skali
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
                Skala mówi, jaką ocenę dostaje uczeń za dany procent punktów. Utwórz ją raz —
                potem tylko wybierasz ją przy sprawdzaniu prac.
              </p>
              <button
                onClick={handleCreateNew}
                className="mt-6 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors cursor-pointer min-h-11 font-medium"
              >
                <Plus className="w-5 h-5" aria-hidden="true" />
                Dodaj pierwszą skalę
              </button>
            </div>
          )}

          {/* Thresholds List */}
          {!isLoading && thresholds.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              {thresholds.map((threshold) => (
                <article
                  key={threshold.id}
                  className="flex h-full flex-col bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5 transition-colors hover:border-slate-700/70"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-slate-100 break-words">{threshold.name}</h3>
                      <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-800/60 px-2 py-1 text-xs font-medium text-slate-300">
                        <ListChecks className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        <span className="tabular-nums">
                          {threshold.thresholds.length} {entriesWord(threshold.thresholds.length)}
                        </span>
                      </span>
                    </div>
                    <div className="flex gap-1 shrink-0 -mt-1.5 -mr-1.5">
                      <button
                        onClick={() => handleEdit(threshold)}
                        className="p-2 rounded-xl hover:bg-slate-800/60 transition-colors cursor-pointer min-h-11 min-w-11 flex items-center justify-center"
                        title={`Edytuj skalę ${threshold.name}`}
                        aria-label={`Edytuj skalę ${threshold.name}`}
                      >
                        <Edit2 className="w-5 h-5 text-blue-400" aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(threshold.id)}
                        className="p-2 rounded-xl hover:bg-rose-500/20 transition-colors cursor-pointer min-h-11 min-w-11 flex items-center justify-center"
                        title={`Usuń skalę ${threshold.name}`}
                        aria-label={`Usuń skalę ${threshold.name}`}
                      >
                        <Trash2 className="w-5 h-5 text-rose-400" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* Drabina progów */}
                  <ul className="mt-4 space-y-1.5">
                    {threshold.thresholds.map((entry, index) => (
                      <li
                        key={index}
                        className="flex items-center gap-3 rounded-lg bg-slate-900/50 border border-slate-800/60 px-3 py-2"
                      >
                        <span
                          className="w-7 h-7 shrink-0 rounded-lg bg-blue-500/15 text-blue-300 flex items-center justify-center text-sm font-bold tabular-nums"
                          aria-hidden="true"
                        >
                          {entry.grade}
                        </span>
                        <span className="sr-only">Ocena {entry.grade}:</span>
                        <span className="flex-1 min-w-0 text-xs text-slate-400">od</span>
                        <span className="text-sm font-semibold text-slate-100 tabular-nums">
                          {entry.min_percent}%
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-4">
                    <p className="text-xs text-slate-400 tabular-nums">
                      Utworzono: <time dateTime={threshold.created_at}>{new Date(threshold.created_at).toLocaleDateString('pl-PL')}</time>
                    </p>

                    {confirmDeleteId === threshold.id && (
                      <div className="mt-3 p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl">
                        <p className="text-sm text-rose-200">
                          Usunąć tę skalę ocen? Sesje korzystające z niej nie zostaną usunięte.
                        </p>
                        <div className="mt-3 flex gap-2 justify-end">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg transition-colors text-sm cursor-pointer min-h-11"
                          >
                            Anuluj
                          </button>
                          <button
                            onClick={() => handleDelete(threshold.id)}
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
