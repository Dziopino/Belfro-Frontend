import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Ostatnia sieć pod drzewem tras. Bez niej jeden wyjątek w renderze (np. pole, którego backend
 * nie zwrócił w nowej odpowiedzi) zamienia całą aplikację w pusty ekran `#root` — nauczyciel
 * widzi biel i nie ma jak wrócić.
 *
 * Treść błędu jest pokazywana tylko w dewelopce: komunikat wyjątku bywa okraszony ścieżką pliku
 * albo fragmentem odpowiedzi z danymi ucznia, a w produkcji nikt tego na ekranie nie potrzebuje.
 * Oceny i tak są w bazie, więc przeładowanie niczego nie kasuje.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render(): ReactNode {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0B0F19] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#131B2E] border border-slate-800/60 rounded-2xl p-6 text-center">
          <h1 className="text-xl font-bold text-slate-100 mb-2">Ekran się rozłożył</h1>
          <p className="text-sm text-slate-400 mb-5">
            Nic nie zniknęło: oceny są zapisane na koncie. Spróbuj wejść na stronę od nowa.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors cursor-pointer min-h-11"
            >
              Przeładuj stronę
            </button>
            <a
              href="/dashboard"
              className="px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium rounded-xl transition-colors min-h-11 inline-flex items-center justify-center"
            >
              Wróć na pulpit
            </a>
          </div>
          {import.meta.env.DEV && (
            <details className="mt-5 text-left">
              <summary className="text-xs text-slate-400 cursor-pointer">Szczegóły dla developera</summary>
              <pre className="mt-2 text-xs text-rose-400 whitespace-pre-wrap break-words">{error.stack ?? error.message}</pre>
            </details>
          )}
        </div>
      </main>
    );
  }
}
