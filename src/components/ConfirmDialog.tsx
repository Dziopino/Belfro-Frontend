import { useId, useRef, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Blokuje oba przyciski, gdy akcja w tle już trwa — podwójne kliknięcie nie wywoła drugiego żądania. */
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Okno potwierdzenia dla akcji nieodwracalnych. Fokus startuje na „Anuluj" i Escape też anuluje,
 * bo domyślnym wyborem przy kasowaniu danych ma być bezpieczny.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  isBusy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const handleClose = () => {
    if (!isBusy) onCancel();
  };

  useDialog(open, panelRef, handleClose, cancelRef);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" aria-hidden="true" onClick={handleClose}></div>

      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative w-full max-w-md bg-[#131B2E] border border-slate-800/60 rounded-2xl p-5 shadow-2xl outline-none"
      >
        <div className="flex items-start gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-rose-500/20 rounded-xl shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-400" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-100">
              {title}
            </h2>
            <div id={descriptionId} className="text-sm text-slate-400 mt-1">
              {description}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium rounded-xl transition-colors text-sm cursor-pointer min-h-11 disabled:opacity-50"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl transition-colors text-sm cursor-pointer min-h-11 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
