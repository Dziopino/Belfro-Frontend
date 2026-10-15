import { useState, useTransition } from 'react';
import { FileDown, Scissors } from 'lucide-react';
import type { SessionSummaryData } from './SessionSummaryTable';

type PdfKind = 'arkusz' | 'metryczki';

type Props = {
  data: SessionSummaryData;
  disabled?: boolean;
};

type Feedback = { tone: 'ok' | 'error'; text: string };

/** PDF generuje się po stronie przeglądarki — stąd jspdf wchodzi tylko przy pierwszym kliknięciu. */
const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60';

export function pdfErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === 'FONT_LOAD_FAILED') {
      return 'Nie udało się wczytać czcionki — odśwież stronę i spróbuj ponownie.';
    }
    if (err.name === 'PdfLayoutError') {
      return 'Układ PDF nie mieści się na stronie — skontaktuj się z supportem.';
    }
    if (err.name === 'PdfPreconditionError') {
      return err.message;
    }
  }

  return 'Nie udało się wygenerować PDF. Spróbuj ponownie.';
}

function pagesLabel(count: number): string {
  if (count === 1) return 'strona';
  if (count >= 2 && count <= 4) return 'strony';
  return 'stron';
}

export default function PdfActionsBar({ data, disabled = false }: Props) {
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<PdfKind | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const showFeedback = (next: Feedback | null) => {
    startTransition(() => setFeedback(next));
  };

  const run = async (kind: PdfKind) => {
    setBusy(kind);
    showFeedback(null);

    try {
      const { generateClassSheet, generateStudentSlips, savePdf } = await import('../utils/sessionPdf');
      const generate = kind === 'arkusz' ? generateClassSheet : generateStudentSlips;
      const result = await generate(data);

      savePdf(result);
      showFeedback({
        tone: 'ok',
        text: `Zapisano: ${result.fileName} • ${result.pageCount} ${pagesLabel(result.pageCount)}`,
      });
    } catch (err) {
      // Bez logowania treści pracy — w tym pliku są imiona i nazwiska uczniów
      console.error('Nie udało się wygenerować PDF', kind, err instanceof Error ? err.name : typeof err);
      showFeedback({ tone: 'error', text: pdfErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const locked = disabled || busy !== null;

  return (
    <section
      className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-5"
      aria-busy={busy !== null}
      aria-label="Eksport sesji do PDF"
    >
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
        <button
          type="button"
          onClick={() => run('metryczki')}
          disabled={locked}
          title="Trzy metryczki na stronie A4, z liniami cięcia"
          className={`${BUTTON_BASE} bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700`}
        >
          <Scissors className="w-4 h-4" aria-hidden="true" />
          {busy === 'metryczki' ? 'Generowanie…' : 'Pobierz Indywidualne Metryczki (PDF)'}
        </button>

        <button
          type="button"
          onClick={() => run('arkusz')}
          disabled={locked}
          title="Zbiorcza tabela całej klasy do archiwum"
          className={`${BUTTON_BASE} bg-blue-600 hover:bg-blue-500 text-white`}
        >
          <FileDown className="w-4 h-4" aria-hidden="true" />
          {busy === 'arkusz' ? 'Generowanie…' : 'Pobierz Arkusz Zbiorczy (PDF)'}
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Pliki tworzą się w tej przeglądarce — prace uczniów nie opuszczają komputera
      </p>

      <div role="status" aria-live="polite" className="min-h-[1.5rem] mt-2">
        {feedback ? (
          <p className={`text-sm ${feedback.tone === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>{feedback.text}</p>
        ) : null}
      </div>
    </section>
  );
}
