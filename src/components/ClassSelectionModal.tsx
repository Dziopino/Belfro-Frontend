import { useState, useEffect, useId, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { classesAPI } from '../services/apiService';
import { decryptData } from '../services/cryptoService';
import { useDialog } from '../hooks/useDialog';
import type { Class } from '../types';
import { Users, X, CheckCircle2 } from 'lucide-react';
import { apiErrorMessage } from '../utils/apiError';

interface ClassSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DecryptedClass extends Class {
  decrypted_name: string;
  decrypt_failed: boolean;
}

/** Nazwa nieczytelna bez klucza — ten sam zwrot co na liście klas i w nagłówku klasy. */
const CLASS_NAME_UNREADABLE = 'Nie udało się wczytać nazwy';

export default function ClassSelectionModal({ isOpen, onClose }: ClassSelectionModalProps) {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<DecryptedClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadClasses();
    }
  }, [isOpen]);

  const loadClasses = async () => {
    try {
      setIsLoading(true);
      setError('');

      const { classes: fetchedClasses } = await classesAPI.getClasses();

      // Odszyfruj nazwy klas
      const decryptedClasses: DecryptedClass[] = [];
      for (const cls of fetchedClasses) {
        try {
          decryptedClasses.push({
            ...cls,
            decrypted_name: await decryptData(cls.encrypted_name),
            decrypt_failed: false,
          });
        } catch (err) {
          console.error(`Nie udało się odszyfrować nazwy klasy ${cls.id}:`, err);
          decryptedClasses.push({
            ...cls,
            decrypted_name: CLASS_NAME_UNREADABLE,
            decrypt_failed: true,
          });
        }
      }

      setClasses(decryptedClasses);

      // Klucz jest wspólny dla całej listy: jeśli nie odszyfrował niczego, picker i tak nie ma
      // o czym decydować, więc pokazujemy przyczynę zamiast serii identycznych etykiet.
      if (decryptedClasses.length > 0 && decryptedClasses.every((cls) => cls.decrypt_failed)) {
        setError(
          'Nie udało się odszyfrować nazwy żadnej klasy. Klucz deszyfrujący istnieje tylko w tej ' +
            'przeglądarce, więc wyloguj się i zaloguj ponownie.'
        );
      }
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się załadować klas'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClassSelect = (classId: string) => {
    navigate(`/grading/${classId}`);
    onClose();
  };

  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDialog(isOpen, panelRef, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Zaciemnienie: klik poza panelem zamyka, sam panel jest dialogiem */}
      <div onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel okna */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-2xl bg-[#0B0F19] border border-slate-800/60 rounded-2xl shadow-2xl max-h-[80vh] flex flex-col outline-none"
      >
        {/* Nagłówek */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800/60">
          <div>
            <h2 id={titleId} className="text-xl sm:text-2xl font-bold text-slate-100">
              Wybierz klasę do sprawdzenia
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Kliknij klasę, aby rozpocząć nowe sprawdzanie
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800/50 rounded-lg text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Treść */}
        <div
          role="region"
          aria-label="Dostępne klasy"
          tabIndex={0}
          className="flex-1 overflow-y-auto p-6 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin motion-reduce:animate-none rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-slate-400">Ładowanie klas…</p>
              </div>
            </div>
          ) : error ? (
            <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-4">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          ) : classes.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-100 mb-2">
                Brak klas
              </h3>
              <p className="text-sm text-slate-400 mb-4">
                Najpierw utwórz klasę i dodaj uczniów
              </p>
              <button
                onClick={() => {
                  navigate('/classes');
                  onClose();
                }}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors cursor-pointer"
              >
                Przejdź do zarządzania klasami
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {classes.map((cls) => {
                const studentCount = cls._count?.students || 0;
                const isEmpty = studentCount === 0;

                return (
                  <button
                    key={cls.id}
                    onClick={() => !isEmpty && handleClassSelect(cls.id)}
                    disabled={isEmpty}
                    className={`bg-[#131B2E] border rounded-2xl p-5 transition-all duration-200 text-left ${
                      isEmpty
                        ? 'border-slate-800/60 opacity-60 cursor-not-allowed'
                        : 'border-slate-800/60 hover:bg-slate-800/30 hover:border-blue-500/50 group cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform ${
                        isEmpty
                          ? 'bg-slate-700/30'
                          : 'bg-blue-500/20 group-hover:scale-110'
                      }`}>
                        <Users className={`w-6 h-6 ${isEmpty ? 'text-slate-400' : 'text-blue-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-slate-100 mb-1 truncate">
                          {cls.decrypted_name}
                        </h3>
                        <p className="text-sm mb-2 text-slate-400">
                          {studentCount} {studentCount === 1 ? 'uczeń' : 'uczniów'}
                        </p>
                        {isEmpty ? (
                          <div className="flex items-center gap-1.5 text-xs text-amber-400">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span>Brak uczniów</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Gotowe do sprawdzania</span>
                          </div>
                        )}
                      </div>
                      <div className="transition-colors text-slate-400 group-hover:text-blue-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Stopka: co się stanie po wyborze */}
        {!isLoading && classes.length > 0 && (
          <div className="p-6 border-t border-slate-800/60 bg-slate-900/30">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
              <span>Po wybraniu klasy przejdziesz do wprowadzania klucza odpowiedzi</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
