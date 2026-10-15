import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Loader2, MessageSquareText, ShieldCheck } from 'lucide-react';
import { authAPI } from '../services/apiService';
import { toAuthError, useAuth } from '../contexts/AuthContext';
import BrandMark from '../components/BrandMark';

/** Awaryjna długość cooldownu, gdyby backend nie podał swojej. */
const DEFAULT_COOLDOWN_SECONDS = 60;

/** Polska odmiana: 1 minutę, 2-4 minuty, 5+ minut. */
function minutesLabel(value: number): string {
  if (value === 1) return 'minutę';
  if (value >= 2 && value <= 4) return 'minuty';
  return 'minut';
}

type Phase = 'entering' | 'verified';

export default function VerifyPhonePage() {
  const { user, logout, refreshUser } = useAuth();

  // Ta strona żyje za tokenem, ale jeszcze nie za pełną sesją: klucz E2E powstaje wyłącznie
  // z wpisanego hasła, więc sprawdzamy sam token, a nie isAuthenticated. Inaczej wejście tu
  // z linku albo po odświeżeniu karty wybiłoby nauczyciela z powrotem na logowanie.
  const [hasToken] = useState(() => !!localStorage.getItem('auth_token'));

  const [phase, setPhase] = useState<Phase>('entering');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Cooldown liczony z deadline'u, nie z odliczanej zmiennej: przewinięta karta w tle
  // i restart efektu nie mogą go ani skrócić, ani wydłużyć.
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Kod kosztuje pieniądze, a StrictMode woła efekt drugi raz — bez guarda mielibyśmy dwa SMS-y.
  const attempted = useRef(false);

  useEffect(() => {
    if (retryAt === null) return;

    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();

    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  const request = async () => {
    setIsSending(true);
    setError('');

    try {
      const response = await authAPI.sendSmsCode();
      setRetryAt(Date.now() + response.retry_after_seconds * 1000);
      const minutes = Math.round(response.expires_in_seconds / 60);
      setNotice(`Kod poszedł na ${response.phone}. Jest ważny ${minutes} ${minutesLabel(minutes)}.`);
      return;
    } catch (err) {
      const authError = toAuthError(err, 'Nie udało się wysłać kodu SMS.');

      // Cooldown to stan normalny, nie awaria: pokazujemy licznik zamiast czerwonego tekstu.
      if (authError.code === 'SMS_COOLDOWN_ACTIVE') {
        const wait = Number((err as any)?.response?.data?.retry_after_seconds) || DEFAULT_COOLDOWN_SECONDS;
        setRetryAt(Date.now() + wait * 1000);
        setNotice(authError.message);
        return;
      }

      setError(authError.message);
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (attempted.current || !hasToken) return;
    attempted.current = true;

    void request();
  }, [hasToken]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || isVerifying) return;

    setIsVerifying(true);
    setError('');

    try {
      await authAPI.verifySmsCode({ code });
      await refreshUser();
      setPhase('verified');
    } catch (err) {
      const authError = toAuthError(err, 'Nie udało się sprawdzić kodu.');
      setError(authError.message);

      // Wygasły albo skasowany kod nie ma już czego przepisywać; przy błędnych cyfrach zostawiamy
      // wpis, bo zwykle chodzi o jedną literówkę.
      if (authError.code !== 'SMS_CODE_INVALID') setCode('');
    } finally {
      setIsVerifying(false);
    }
  };

  if (!hasToken) return <Navigate to="/login" replace />;
  if (phase === 'verified') return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F19] py-8 px-4 sm:py-12 sm:px-6 lg:px-8">
      <main id="main-content" tabIndex={-1} className="max-w-md w-full space-y-6 sm:space-y-8">
        {/* Logo */}
        <div className="text-center">
          <BrandMark />
        </div>

        <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <MessageSquareText className="w-5 h-5 text-blue-400" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-white">Potwierdź numer telefonu</h1>
              <p className="text-xs text-slate-400 tabular-nums">Kod idzie na {user?.phone || 'numer z konta'}</p>
            </div>
          </div>

          <p className="text-sm text-slate-400 leading-relaxed">
            Ostatni krok przed sprawdzeniem prac. Kod z SMS-a wpisz poniżej — działa 5 minut.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="sms-code" className="block text-sm font-medium text-slate-300 mb-2">
                Kod z SMS-a
              </label>
              <input
                id="sms-code"
                name="sms-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                aria-label="Sześciocyfrowy kod SMS"
                placeholder="000000"
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-lg sm:text-xl tracking-[0.4em] text-center tabular-nums"
              />
            </div>

            <button
              type="submit"
              disabled={code.length !== 6 || isVerifying || isSending}
              className="w-full flex justify-center items-center gap-2 py-2.5 sm:py-3 px-4 text-sm sm:text-base font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer min-h-11"
            >
              {isVerifying ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {isVerifying ? 'Sprawdzanie…' : 'Zweryfikuj'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => void request()}
            disabled={isSending || secondsLeft > 0}
            title={secondsLeft > 0 ? `Możesz poprosić o kod za ${secondsLeft} s` : 'Wyślij kod ponownie'}
            className="w-full flex justify-center items-center gap-2 py-2.5 sm:py-3 px-4 text-sm font-medium rounded-xl text-slate-200 bg-slate-700/50 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer min-h-11"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {isSending
              ? 'Wysyłanie…'
              : secondsLeft > 0
                ? `Wyślij kod ponownie za ${secondsLeft} s`
                : 'Wyślij kod ponownie'}
          </button>

          <div role="status" aria-live="polite" className="min-h-[1.5rem] space-y-2">
            {notice && !error ? <p className="text-sm text-slate-400">{notice}</p> : null}
            {error ? (
              <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-3">
                <p className="text-sm text-rose-400">{error}</p>
              </div>
            ) : null}
          </div>

          <div className="pt-1 flex items-center justify-between gap-3 border-t border-slate-800/60">
            <p className="text-xs text-slate-400 leading-relaxed flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
              Numer służy tylko do odcięcia mnożenia darmowych kont. W aplikacji widzisz go w masce.
            </p>
            <button
              type="button"
              onClick={logout}
              className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer whitespace-nowrap min-h-11"
            >
              Wyloguj
            </button>
          </div>

          <p className="text-sm text-slate-400 text-center">
            <Link to="/login" className="font-medium text-blue-400 hover:text-blue-300 transition-colors">
              Wróć do logowania
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
