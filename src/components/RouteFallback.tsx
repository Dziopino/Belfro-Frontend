/**
 * Ekran czekający na pakiet widoku. Pokazuje się w jednym momencie: gdy moduł doczytywany
 * przy nawigacji jeszcze nie doszedł z sieci. `role="status"` z `aria-live` sprawia, że czytnik
 * ekranu czyta tę wiadomość zamiast zamilknąć w połowie nawigacji.
 *
 * `<main>` jest tu celowo pominięty. Właściwy widok wnosi `id="main-content"`, a powtórzenie tego
 * identyfikatora w dokumencie byłoby nieprawidłowym HTML-em i skierowałoby skip-link w dwie
 * strony naraz.
 */
export default function RouteFallback() {
  return (
    <div role="status" aria-live="polite" className="min-h-screen flex items-center justify-center bg-[#0B0F19]">
      <div className="text-center">
        <div
          aria-hidden="true"
          className="animate-spin motion-reduce:animate-none rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"
        ></div>
        <p className="text-slate-400">Ładowanie strony…</p>
      </div>
    </div>
  );
}
