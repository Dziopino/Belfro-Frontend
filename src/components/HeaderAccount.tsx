import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { pluralPolish } from '../utils/polish';

function pagesWord(count: number): string {
  return pluralPolish(count, 'strona', 'strony', 'stron');
}

interface HeaderAccountProps {
  /**
   * Portfel zna saldo z `GET /wallet`, które jest świeższe niż to z `/auth/me`.
   * Bez podania bierzemy saldo z obiektu użytkownika — to samo, co w pozostałych nagłówkach.
   */
  pagesLeft?: number | null;
}

/**
 * Prawa strona nagłówka, identyczna na każdej podstronie: imię i nazwisko z ustawień konta,
 * a gdy jest puste — adres email; pod spodem saldo stron; obok wylogowanie jako sama ikona.
 * Blok klikalny prowadzi do portfela, bo to najszybsza droga do doładowania przy zerowym saldzie.
 */
export default function HeaderAccount({ pagesLeft }: HeaderAccountProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const balance = pagesLeft === undefined ? user?.pages_current_limit ?? null : pagesLeft;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-4 border-l border-slate-800/60">
      <button
        type="button"
        onClick={() => navigate('/wallet')}
        title="Doładuj konto"
        className="block text-right min-w-0 cursor-pointer group"
      >
        <p className="text-sm font-medium text-slate-100 truncate max-w-[11ch] sm:max-w-[24ch]">
          {user?.display_name || user?.email}
        </p>
        <p className="text-xs text-slate-400 tabular-nums group-hover:text-blue-400 transition-colors">
          Saldo: {balance === null ? '—' : `${balance} ${pagesWord(balance)}`}
        </p>
      </button>

      <button
        type="button"
        onClick={handleLogout}
        className="p-2 rounded-xl hover:bg-slate-800/50 transition-colors cursor-pointer min-h-11 min-w-11 flex items-center justify-center"
        title="Wyloguj się"
        aria-label="Wyloguj się"
      >
        <LogOut className="w-5 h-5 text-slate-400" aria-hidden="true" />
      </button>
    </div>
  );
}
