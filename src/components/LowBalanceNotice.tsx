import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { pluralPolish } from '../utils/polish';

function pagesWord(count: number): string {
  return pluralPolish(count, 'strona', 'strony', 'stron');
}

/**
 * Przypomnienie o saldzie, którego próg nauczyciel wybiera na stronie ustawień.
 * Null przy progu 0 jest celowy: 0 znaczy „nie przypominaj", a nie „zawsze".
 */
export default function LowBalanceNotice() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const balance = user?.pages_current_limit ?? 0;
  const threshold = user?.low_balance_alert_threshold ?? 0;

  if (threshold <= 0 || balance >= threshold) return null;

  return (
    <div
      className="bg-amber-950/40 border border-amber-800/50 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3"
      role="status"
    >
      <p className="text-sm text-amber-300 min-w-0">
        <span className="inline-flex items-center gap-2 font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          Zostało {balance} {pagesWord(balance)}
        </span>{' '}
        <span className="text-amber-200/80">
          — poniżej progu {threshold} {pagesWord(threshold)} ustawionego w ustawieniach konta.
        </span>
      </p>

      <button
        type="button"
        onClick={() => navigate('/wallet')}
        className="ml-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer min-h-11 shrink-0"
      >
        Doładuj konto
      </button>
    </div>
  );
}
