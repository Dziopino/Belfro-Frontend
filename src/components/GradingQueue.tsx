import { useMemo, useState, useRef } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { gradingAPI } from '../services/apiService';
import { useDecryptedStudents } from '../hooks/useDecryptedStudents';
import { pluralPolish } from '../utils/polish';
import { apiErrorMessage } from '../utils/apiError';
import type { SessionGroupView, Student } from '../types';
import { Upload, Shield, ArrowRight, X, CheckCircle2, UserX, StopCircle, Layers } from 'lucide-react';

interface GradingQueueProps {
  sessionId: string;
  students: Student[];
  /** Grupy zamrożone na sesji — tylko po to, by ustawiać kolejność i pokazywać czyją pracę sprawdzasz */
  groups?: SessionGroupView[];
  onComplete: () => void;
  /** Nauczyciel oznaczył ucznia jako niepiszącego — rodzic dopisuje go do listy nieobecnych sesji. */
  onStudentSkipped?: (studentId: string) => void;
}

interface UploadedImage {
  /** Własne id, nie indeks: miniatury przetrwają usunięcie środkowej strony bez mieszania DOM-u. */
  id: string;
  file: File;
  preview: string;
  crop?: PixelCrop;
}

// ReactCrop mierzy zaznaczenie w pikselach CSS renderowanego podglądu, a backend
// zamalowuje piksele oryginalnego zdjęcia — bez tego prostokąt jest za mały i przesunięty.
function toNaturalPixels(crop: PixelCrop, el: HTMLImageElement | null): PixelCrop | undefined {
  if (!crop || !el || !el.clientWidth || !el.clientHeight) return undefined;

  const scaleX = el.naturalWidth / el.clientWidth;
  const scaleY = el.naturalHeight / el.clientHeight;

  return {
    ...crop,
    unit: 'px',
    x: Math.round(crop.x * scaleX),
    y: Math.round(crop.y * scaleY),
    width: Math.round(crop.width * scaleX),
    height: Math.round(crop.height * scaleY),
  };
}

const NO_GROUPS: SessionGroupView[] = [];

export default function GradingQueue({ sessionId, students, groups = NO_GROUPS, onComplete, onStudentSkipped }: GradingQueueProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState<number | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const [submittedIds, setSubmittedIds] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  // Koniec jednej grupy przy jeszcze nieprzerobionej reszcie — nie zamykamy wtedy całej sesji
  const [groupFinished, setGroupFinished] = useState(false);

  const imageRef = useRef<HTMLImageElement>(null);

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      for (const studentId of group.student_ids) map.set(studentId, group.name);
    }
    return map;
  }, [groups]);

  // Prace tej samej grupy idą razem: nauczyciel odkłada wariant A, zanim sięgnie po klucz B.
  // Uczeń bez przydziału (dopisany do klasy po utworzeniu sesji) trafia na koniec, więc nikt nie znika.
  const orderedStudents = useMemo(() => {
    if (groups.length === 0) return students;

    const orderOf = (studentId: string) => {
      const name = groupNameById.get(studentId);
      const index = name === undefined ? -1 : groups.findIndex((group) => group.name === name);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };

    // Sort jest stabilny, więc w obrębie grupy uczniowie zostają w kolejności z dziennika.
    return [...students].sort((a, b) => orderOf(a.id) - orderOf(b.id));
  }, [students, groups, groupNameById]);

  const { decryptedStudents, isDecrypting, error: decryptError } = useDecryptedStudents(orderedStudents);

  const handledIds = useMemo(() => new Set([...submittedIds, ...skippedIds]), [submittedIds, skippedIds]);

  // Praca obsłużona w tym przejściu wypada z kolejki. Bez tego kliknięcie grupy od nowa startowało od
  // indeksu zero, czyli od uczniów, którzy już mają skan — a każde ponowne wysłanie zastępuje tamten plik.
  const pendingStudents = useMemo(
    () => decryptedStudents.filter((student) => !handledIds.has(student.id)),
    [decryptedStudents, handledIds]
  );

  const visibleStudents = groupFilter
    ? pendingStudents.filter((student) => groupNameById.get(student.id) === groupFilter)
    : pendingStudents;

  const currentStudent = visibleStudents[currentIndex];
  const hasNextVisible = currentIndex < visibleStudents.length - 1;

  // Ile prac zostało poza filtrowaną grupą — bez tej, którą właśnie zatwierdzamy, bo o panelu
  // „grupa sprawdzona” decydujemy w renderze, który jej jeszcze nie zaksięgował.
  const remainingOutsideFilter = groupFilter
    ? pendingStudents.filter((student) => groupNameById.get(student.id) !== groupFilter).length
    : 0;

  const skippedCount = skippedIds.length;
  const expectedWorks = Math.max(students.length - skippedCount, 0);
  const submittedWorks = submittedIds.length;
  const progress = expectedWorks === 0 ? 100 : (submittedWorks / expectedWorks) * 100;
  const remainingWorks = Math.max(students.length - submittedWorks - skippedCount, 0);
  // Czasownik odmieniamy tą samą regułą co rzeczownik — warunek „2–4” rozmijałby się z `pluralPolish`
  // przy 22–24, które też łączą się z liczbą mnogą.
  const remainingWorkForm = pluralPolish(remainingWorks, 'praca', 'prace', 'prac');
  const remainingWorkVerb =
    remainingWorkForm === 'praca' ? 'Została' : remainingWorkForm === 'prace' ? 'Zostały' : 'Zostało';

  // Chip liczy prace, które zostały, nie uczniów w grupie: grupa, z którą skończyliśmy, znika z paska,
  // więc nie ma czego klikać po raz drugi. `total` zostaje, żeby nauczyciel widział postęp w grupie.
  const groupChips = useMemo(() => {
    const totals = new Map<string, number>();
    const left = new Map<string, number>();

    for (const student of students) {
      const name = groupNameById.get(student.id);
      if (name === undefined) continue;
      totals.set(name, (totals.get(name) ?? 0) + 1);
      if (!handledIds.has(student.id)) left.set(name, (left.get(name) ?? 0) + 1);
    }

    return groups
      .map((group) => ({
        name: group.name,
        remaining: left.get(group.name) ?? 0,
        total: totals.get(group.name) ?? 0,
      }))
      .filter((chip) => chip.remaining > 0);
  }, [groups, students, groupNameById, handledIds]);

  const resetStudentView = () => {
    setUploadedImages([]);
    setCurrentImageIndex(null);
    setImagePreview('');
    setCrop(undefined);
    setCompletedCrop(undefined);
    setError('');
  };

  /**
   * Wywołujemy zawsze PO obsłużeniu pracy (zatwierdzonej lub pominiętej) — ta znika z `visibleStudents`,
   * więc jej następca wchodzi pod ten sam indeks i indeksu nie przestawiamy. Przesunięty o jeden
   * pomijałby jednego ucznia.
   */
  const goToNext = () => {
    if (hasNextVisible) {
      resetStudentView();
      return;
    }

    // Koniec filtrowanej grupy to nie koniec sesji: zostają prace w innych grupach, a zamknięcie
    // kolejki wyrzuciłoby nauczyciela do wyników przed czasem.
    if (groupFilter && remainingOutsideFilter > 0) {
      setGroupFinished(true);
      resetStudentView();
      return;
    }

    onComplete();
  };

  const selectGroup = (name: string | null) => {
    setGroupFilter(name);
    setCurrentIndex(0);
    setGroupFinished(false);
    resetStudentView();
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    // input.value wraca do zera natychmiast: bez tego ten sam plik wybrany ponownie
    // (np. po usunięciu jego miniatury) nie wywołuje zdarzenia change.
    e.target.value = '';

    const images = files.filter((file) => file.type.startsWith('image/'));
    const notImages = files.length - images.length;

    if (images.length === 0) {
      setError(`Żaden z wybranych plików (${pluralPolish(files.length, 'plik', 'pliki', 'plików')}) nie jest obrazem`);
      return;
    }

    // FileReader kończy się w kolejności losowej, a strony skanu muszą zostać w kolejności z dysku —
    // dlatego każdy odczyt trafia do z góry przydzielonego slotu, nie na koniec tablicy.
    const slots = new Array<UploadedImage | undefined>(images.length).fill(undefined);
    let pending = images.length;

    const flush = () => {
      const loaded = slots.filter((img): img is UploadedImage => img !== undefined);
      if (loaded.length > 0) setUploadedImages((prev) => [...prev, ...loaded]);

      if (loaded.length === 0) {
        setError('Nie udało się odczytać żadnego zdjęcia. Spróbuj innego pliku.');
      } else if (notImages > 0) {
        setError(`Pominięto ${notImages} ${pluralPolish(notImages, 'plik', 'pliki', 'plików')} — to nie obrazy.`);
      } else {
        setError('');
      }
    };

    images.forEach((file, slot) => {
      const reader = new FileReader();
      reader.onload = () => {
        slots[slot] = { id: crypto.randomUUID(), file, preview: reader.result as string };
        if (--pending === 0) flush();
      };
      reader.onerror = () => {
        // Bez nazwy pliku: nauczyciele nazywają skany imieniem i nazwiskiem ucznia.
        console.error(`Nie udało się odczytać zdjęcia ${slot + 1} z bieżącego wyboru`);
        if (--pending === 0) flush();
      };
      reader.readAsDataURL(file);
    });
  };

  const handleEditImage = (index: number) => {
    const image = uploadedImages[index];
    setCurrentImageIndex(index);
    setImagePreview(image.preview);
    setCrop(undefined);
    setCompletedCrop(image.crop);
  };

  const handleSaveCrop = () => {
    if (!completedCrop || currentImageIndex === null) return;

    // Zapisz crop dla obecnego obrazu
    setUploadedImages(prev =>
      prev.map((img, idx) =>
        idx === currentImageIndex
          ? { ...img, crop: completedCrop }
          : img
      )
    );

    // Wróć do widoku listy
    setCurrentImageIndex(null);
    setImagePreview('');
    setCrop(undefined);
    setCompletedCrop(undefined);
  };

  const handleRemoveImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmitAll = async () => {
    if (uploadedImages.length === 0) {
      setError('Dodaj co najmniej jedno zdjęcie pracy ucznia');
      return;
    }

    // Sprawdź czy wszystkie obrazy mają oznaczony obszar do anonimizacji
    const imagesWithoutCrop = uploadedImages.filter(img => !img.crop);
    if (imagesWithoutCrop.length > 0) {
      setError('Zaznacz obszar z danymi osobowymi na wszystkich zdjęciach');
      return;
    }

    if (!currentStudent) return;

    setError('');
    setIsUploading(true);

    let sentPages = 0;

    try {
      // Wyślij wszystkie zdjęcia dla tego ucznia
      for (let i = 0; i < uploadedImages.length; i++) {
        const { file, crop } = uploadedImages[i];

        if (!crop) continue;

        await gradingAPI.uploadImage(
          sessionId,
          currentStudent.id,
          file,
          crop.x,
          crop.y,
          crop.width,
          crop.height
        );
        sentPages = i + 1;
      }

      setSubmittedIds((prev) => [...prev, currentStudent.id]);
      goToNext();
    } catch (err: any) {
      console.error(
        `Nie udało się przesłać strony ${sentPages + 1} z ${uploadedImages.length} (sesja ${sessionId}, na serwerze już ${sentPages}):`,
        err
      );
      setError(apiErrorMessage(err, 'Nie udało się przesłać zdjęć'));
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Uczeń bez pracy nie może blokować kolejki: zapisujemy go jako nieobecnego i idziemy dalej.
   * Zdjęcie za niego wrzucisz później, w tej samej sesji, gdy napisze sprawdzian w innym terminie.
   */
  const handleSkipStudent = () => {
    if (!currentStudent) return;

    setSkippedIds((prev) => [...prev, currentStudent.id]);
    onStudentSkipped?.(currentStudent.id);
    goToNext();
  };

  const handleFinishEarly = () => {
    const remaining = remainingWorks;
    const answer = window.confirm(
      `Zakończyć sprawdzanie bez ${remaining} ${pluralPolish(remaining, 'pracy', 'prace', 'prac')}? ` +
        'Brakujące prace dołączysz później do tej samej sesji.'
    );

    if (answer) onComplete();
  };

  const progressBar = (
    <div className="mb-4 sm:mb-6">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs sm:text-sm font-medium text-slate-300 tabular-nums">
          Oddane prace: {submittedWorks} / {expectedWorks}
        </span>
        <span className="text-xs sm:text-sm font-medium text-blue-400">{Math.round(progress)}%</span>
      </div>
      <div className="w-full bg-slate-800/50 rounded-full h-2.5 sm:h-3 overflow-hidden">
        <div
          className="bg-gradient-to-r from-blue-500 to-blue-600 h-2.5 sm:h-3 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );

  const chipClass = (isActive: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs sm:text-sm font-medium transition-colors cursor-pointer min-h-11 tabular-nums ${
      isActive
        ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
        : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-800'
    }`;

  // Uczniowie bez przydziału (dopisani do klasy po utworzeniu sesji) liczą się jak trzecia opcja:
  // bez nich pasek zniknąłby przy ostatniej grupie, a z nim zniknąłoby jedyne wejście na te nazwiska.
  const selectableOptions =
    groupChips.length + (pendingStudents.some((student) => !groupNameById.has(student.id)) ? 1 : 0);

  // Filtr przestawia tylko kolejność przejścia — klucz i tak dobiera backend po id ucznia.
  const groupFilterRow =
    selectableOptions > 1 ? (
      <div className="mb-4 sm:mb-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => selectGroup(null)}
          aria-pressed={groupFilter === null}
          className={chipClass(groupFilter === null)}
        >
          <Layers className="w-3.5 h-3.5" aria-hidden="true" />
          Wszystkie grupy
        </button>
        {groupChips.map((chip) => (
          <button
            key={chip.name}
            type="button"
            onClick={() => selectGroup(chip.name)}
            aria-pressed={groupFilter === chip.name}
            className={chipClass(groupFilter === chip.name)}
          >
            {chip.name}: {chip.remaining} z {chip.total}
          </button>
        ))}
      </div>
    ) : null;

  if (isDecrypting) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin motion-reduce:animate-none rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Wczytywanie listy uczniów…</p>
        </div>
      </div>
    );
  }

  if (!currentStudent && !groupFinished) {
    return (
      <div className="text-center py-12">
        <p className="text-rose-400">Brak uczniów do sprawdzenia</p>
      </div>
    );
  }

  if (groupFinished) {
    return (
      <div className="max-w-5xl mx-auto">
        {progressBar}
        <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100 mb-2 break-words">
            Grupa „{groupFilter}” sprawdzona
          </h2>
          <p className="text-sm text-slate-400 mb-5">
            {remainingWorkVerb} {remainingWorks} {remainingWorkForm} poza tą grupą.
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {groupChips.map((chip) => (
              <button
                key={chip.name}
                type="button"
                onClick={() => selectGroup(chip.name)}
                className={chipClass(false)}
              >
                {chip.name}: {chip.remaining} z {chip.total}
              </button>
            ))}
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 sm:justify-between">
            <button
              type="button"
              onClick={() => selectGroup(null)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer min-h-11 font-medium text-sm sm:text-base"
            >
              <Layers className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
              Wszystkie grupy
            </button>
            <button
              type="button"
              onClick={onComplete}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors cursor-pointer min-h-11 font-medium text-sm sm:text-base"
            >
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
              Zakończ sprawdzanie
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Progress Bar */}
      {progressBar}

      {groupFilterRow}

      {/* Current Student Info */}
      <div className="bg-blue-950/40 border border-blue-800/50 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
          <h2 className="text-lg sm:text-2xl font-bold text-slate-100">Sprawdzasz pracę ucznia:</h2>
          {groupNameById.get(currentStudent.id) && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium bg-blue-950/60 text-blue-300 border border-blue-800/50 max-w-[12rem]">
              <Layers className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{groupNameById.get(currentStudent.id)}</span>
            </span>
          )}
        </div>
        <p className="text-base sm:text-xl text-blue-400">{currentStudent.label}</p>
        {!currentStudent.numbered && (
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Numer z dziennika: {currentStudent.number}
          </p>
        )}
      </div>

      {(error || decryptError) && (
        <div className="mb-4 sm:mb-6 bg-rose-950/40 border border-rose-800/50 rounded-xl p-3 sm:p-4" role="alert">
          {error && <p className="text-sm text-rose-400">{error}</p>}
          {decryptError && (
            <p className={`text-sm text-rose-400${error ? ' mt-2' : ''}`}>{decryptError}</p>
          )}
        </div>
      )}

      {/* Widok edycji pojedynczego zdjęcia */}
      {currentImageIndex !== null && imagePreview ? (
        <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-slate-100">
              Zaznacz obszar z danymi osobowymi
            </h3>
            <button
              type="button"
              onClick={() => {
                setCurrentImageIndex(null);
                setImagePreview('');
                setCrop(undefined);
                setCompletedCrop(undefined);
              }}
              aria-label="Zamknij podgląd zdjęcia"
              className="p-2 -m-2 min-h-11 min-w-11 inline-flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="mb-4 p-3 sm:p-4 bg-amber-950/40 border border-amber-800/50 rounded-xl">
            <div className="flex items-start gap-2 sm:gap-3">
              <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs sm:text-sm text-amber-200 font-medium mb-1">Ważne</p>
                <p className="text-xs text-amber-300/80 leading-relaxed">
                  Zaznacz prostokąt obejmujący TYLKO imię i nazwisko ucznia. Ten obszar zostanie zamazany białym prostokątem.
                </p>
              </div>
            </div>
          </div>

          <div className="mb-4 sm:mb-6 flex justify-center bg-slate-900/50 rounded-xl p-2 sm:p-4 overflow-auto">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(toNaturalPixels(c, imageRef.current))}
              aspect={undefined}
              minWidth={50}
              minHeight={20}
            >
              <img
                ref={imageRef}
                src={imagePreview}
                alt="Zdjęcie pracy ucznia"
                className="max-w-full h-auto max-h-[400px] sm:max-h-[600px] rounded-lg"
              />
            </ReactCrop>
          </div>

          <button
            onClick={handleSaveCrop}
            disabled={!completedCrop}
            className="w-full px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
          >
            Zapisz zaznaczenie
          </button>
        </div>
      ) : (
        <>
          {/* Lista przesłanych zdjęć */}
          {uploadedImages.length > 0 && (
            <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-semibold text-slate-100 mb-4">
                Przesłane zdjęcia ({uploadedImages.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {uploadedImages.map((img, index) => (
                  <div
                    key={img.id}
                    className="relative group bg-slate-900/50 rounded-xl overflow-hidden border border-slate-800/60"
                  >
                    <img
                      src={img.preview}
                      alt={`Strona ${index + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-32 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditImage(index)}
                        className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors cursor-pointer"
                        title="Edytuj zaznaczenie"
                        aria-label={`Edytuj zaznaczenie na stronie ${index + 1}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(index)}
                        className="p-2 bg-rose-600 hover:bg-rose-700 rounded-lg text-white transition-colors cursor-pointer"
                        title="Usuń zdjęcie"
                        aria-label={`Usuń stronę ${index + 1}`}
                      >
                        <X className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 rounded text-xs text-white">
                      {index + 1}
                    </div>
                    {img.crop && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload nowych zdjęć */}
          <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6">
            <h3 className="text-base sm:text-lg font-semibold text-slate-100 mb-3 sm:mb-4">
              {uploadedImages.length === 0 ? '1. Wgraj zdjęcia pracy' : 'Dodaj kolejne zdjęcia'}
            </h3>
            <label className="block cursor-pointer">
              <div className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-6 sm:p-8 text-center transition-all">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
                </div>
                <p className="text-sm sm:text-base text-slate-300 mb-2 font-medium">
                  {uploadedImages.length === 0
                    ? 'Kliknij, aby wybrać zdjęcia pracy ucznia'
                    : 'Dodaj więcej zdjęć'
                  }
                </p>
                <p className="text-xs sm:text-sm text-slate-400">
                  Możesz wybrać wiele plików naraz (JPG, PNG, max 10MB każdy)
                </p>
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
              />
            </label>
          </div>

          {/* Akcje bez zdjęcia: nieobecność tego ucznia i przerwanie całej kolejki */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:justify-end mb-4 sm:mb-6">
            <button
              onClick={handleFinishEarly}
              disabled={isUploading}
              title="Zakończ sprawdzanie, brakujące prace dołączysz później"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer min-h-11 disabled:opacity-50 font-medium text-sm sm:text-base"
            >
              <StopCircle className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
              Zakończ bez reszty
            </button>
            <button
              onClick={handleSkipStudent}
              disabled={isUploading}
              title="Ten uczeń nie pisał sprawdzianu"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl transition-colors cursor-pointer min-h-11 disabled:opacity-50 font-medium text-sm sm:text-base"
            >
              <UserX className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
              Uczeń nie pisał sprawdzianu
            </button>
          </div>

          {/* Przycisk wysyłania */}
          {uploadedImages.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <button
                onClick={handleSubmitAll}
                disabled={isUploading || uploadedImages.some(img => !img.crop)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
              >
                {isUploading ? (
                  'Wysyłanie…'
                ) : hasNextVisible ? (
                  <>
                    Zatwierdź i przejdź dalej ({uploadedImages.length} {pluralPolish(uploadedImages.length, 'zdjęcie', 'zdjęcia', 'zdjęć')})
                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                  </>
                ) : groupFilter && remainingOutsideFilter > 0 ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    Zatwierdź ostatnią pracę tej grupy ({uploadedImages.length} {pluralPolish(uploadedImages.length, 'zdjęcie', 'zdjęcia', 'zdjęć')})
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    Zatwierdź ostatnią pracę ({uploadedImages.length} {pluralPolish(uploadedImages.length, 'zdjęcie', 'zdjęcia', 'zdjęć')})
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
