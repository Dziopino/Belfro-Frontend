import { useState, useEffect } from 'react';
import { thresholdsAPI } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import type { GradeThreshold, GradeEntry } from '../types';
import { createDefaultGradeScale } from '../utils/grading';
import { ChevronRight, Plus, Save, X } from 'lucide-react';
import { apiErrorMessage } from '../utils/apiError';

interface ThresholdSelectionProps {
  onSelected: (thresholdId: string | null) => void;
}

export default function ThresholdSelection({ onSelected }: ThresholdSelectionProps) {
  const { user } = useAuth();
  const [thresholds, setThresholds] = useState<GradeThreshold[]>([]);
  // Domyślna skala z ustawień konta. Id wskazuje wiersz, który wciąż istnieje — baza rozłącza
  // to wskazanie sama (SetNull), gdy nauczyciel usunie skalę.
  const [selectedId, setSelectedId] = useState<string | null>(user?.default_grade_threshold_id ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Stan formularza nowej skali
  const [formName, setFormName] = useState('');
  const [formEntries, setFormEntries] = useState<GradeEntry[]>(createDefaultGradeScale());

  useEffect(() => {
    loadThresholds();
  }, []);

  const loadThresholds = async () => {
    try {
      setIsLoading(false);
      setError('');
      const { thresholds: fetchedThresholds } = await thresholdsAPI.getThresholds();
      setThresholds(fetchedThresholds);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się załadować skal ocen'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (id: string | null) => {
    setSelectedId(id);
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

  const handleCreateNew = async () => {
    setError('');
    setIsSaving(true);

    try {
      const { threshold } = await thresholdsAPI.createThreshold({
        name: formName,
        thresholds: formEntries,
      });

      await loadThresholds();
      setSelectedId(threshold.id);
      setShowNewForm(false);
      setFormName('');
      setFormEntries(createDefaultGradeScale());
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się utworzyć skali'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleContinue = () => {
    onSelected(selectedId);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-[#131B2E] rounded-lg p-6">
        <h2 className="text-2xl font-bold text-white mb-2">Progi ocen</h2>
        <p className="text-slate-400 mb-6">
          Wybierz skalę oceniania lub pomiń, jeśli chcesz sprawdzić tylko punkty
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg" role="alert">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin motion-reduce:animate-none rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-slate-400">Ładowanie skal…</p>
          </div>
        ) : (
          <>
            {/* Opcja: Bez progów */}
            <div className="mb-4">
              <label
                className="flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all"
                style={{
                  backgroundColor: selectedId === null ? '#1A2338' : 'transparent',
                  // Granica niezaznaczonego steru musi mieć 3:1 (WCAG 1.4.11); dawny #374151 dawał 1,66.
                  borderColor: selectedId === null ? '#3B82F6' : '#64748B',
                }}
              >
                <input
                  type="radio"
                  name="threshold"
                  checked={selectedId === null}
                  onChange={() => handleSelect(null)}
                  className="w-5 h-5"
                />
                <div className="flex-1">
                  <p className="text-white font-medium">Bez progów ocen</p>
                  <p className="text-sm text-slate-400">Wyświetl tylko punkty, bez przeliczania na oceny</p>
                </div>
              </label>
            </div>

            {/* Istniejące skale */}
            {thresholds.map((threshold) => (
              <div key={threshold.id} className="mb-4">
                <label
                  className="flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all"
                  style={{
                    backgroundColor: selectedId === threshold.id ? '#1A2338' : 'transparent',
                    borderColor: selectedId === threshold.id ? '#3B82F6' : '#64748B',
                  }}
                >
                  <input
                    type="radio"
                    name="threshold"
                    checked={selectedId === threshold.id}
                    onChange={() => handleSelect(threshold.id)}
                    className="w-5 h-5"
                  />
                  <div className="flex-1">
                    <p className="text-white font-medium">{threshold.name}</p>
                    <p className="text-sm text-slate-400">
                      {threshold.thresholds.map(e => `${e.grade}: ${e.min_percent}%`).join(', ')}
                    </p>
                  </div>
                </label>
              </div>
            ))}

            {/* Nowa skala */}
            {!showNewForm ? (
              <button
                onClick={() => setShowNewForm(true)}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-slate-500 hover:border-blue-500 hover:bg-[#1A2338] transition-all text-slate-400 hover:text-white"
                style={{ minHeight: '44px' }}
              >
                <Plus className="w-5 h-5" />
                Utwórz nową skalę
              </button>
            ) : (
              <div className="p-4 rounded-lg border-2 border-blue-500" style={{ backgroundColor: '#1A2338' }}>
                <h3 className="text-white font-medium mb-4">Nowa skala ocen</h3>

                <div className="mb-4">
                  <label htmlFor="new-threshold-name" className="block text-sm font-medium text-slate-300 mb-2">
                    Nazwa skali
                  </label>
                  <input
                    id="new-threshold-name"
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    style={{ backgroundColor: '#0B0F19' }}
                    placeholder="np. Standardowa 1-6"
                  />
                </div>

                <div className="space-y-2 mb-4">
                  {formEntries.map((entry, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        aria-label={`Nazwa oceny w wierszu ${index + 1}`}
                        value={entry.grade}
                        onChange={(e) => handleEntryChange(index, 'grade', e.target.value)}
                        className="w-20 px-3 py-2 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        style={{ backgroundColor: '#0B0F19' }}
                        placeholder="Ocena"
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        aria-label={`Próg procentowy dla oceny ${entry.grade || index + 1}`}
                        value={entry.min_percent}
                        onChange={(e) => handleEntryChange(index, 'min_percent', parseInt(e.target.value) || 0)}
                        className="flex-1 px-3 py-2 rounded-lg text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        style={{ backgroundColor: '#0B0F19' }}
                        placeholder="Min %"
                      />
                      {formEntries.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEntry(index)}
                          aria-label={`Usuń wiersz progu ${index + 1}`}
                          className="px-3 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 cursor-pointer"
                          style={{ minHeight: '44px', minWidth: '44px' }}
                        >
                          <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {formEntries.length < 6 && (
                  <button
                    onClick={handleAddEntry}
                    className="mb-4 text-sm text-blue-400 hover:text-blue-300"
                  >
                    + Dodaj próg
                  </button>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowNewForm(false);
                      setFormName('');
                      setFormEntries(createDefaultGradeScale());
                    }}
                    className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
                    style={{ minHeight: '44px' }}
                    disabled={isSaving}
                  >
                    Anuluj
                  </button>
                  <button
                    onClick={handleCreateNew}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    style={{ minHeight: '44px' }}
                    disabled={isSaving}
                  >
                    <Save className="w-5 h-5" aria-hidden="true" />
                    {isSaving ? 'Zapisywanie…' : 'Zapisz i użyj'}
                  </button>
                </div>
              </div>
            )}

            {/* Przycisk kontynuacji */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleContinue}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                style={{ minHeight: '44px' }}
              >
                Kontynuuj
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
