import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/apiService';
import { loadCaptchaConfig } from '../services/captchaService';
import BrandMark from '../components/BrandMark';
import TurnstileWidget, {
  type TurnstileFailure,
  type TurnstileWidgetHandle,
} from '../components/TurnstileWidget';
import type { CaptchaConfig } from '../types';

/**
 * Siatka bezpieczeństwa, nie ścieżka domyślna: challenge, który ma przejść bez interakcji,
 * oddaje token w ułamek sekundy. Cztery sekundy wystarczają na wolne łącze, a poprzednie
 * dziesięć tylko odwlekało ten sam widok. Czekanie kończy się też wcześniej, gdy widżet
 * zgłosi awarię — po niej token i tak nie padnie.
 */
const TURNSTILE_WAIT_MS = 4000;

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const justVerified = searchParams.get('verified') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Oddzielne od `isLoading`, bo czekanie na token to nie wysyłka formularza — nauczyciel musi
  // widzieć, że trwa sprawdzanie, a nie że aplikacja „loguje" bez wyniku.
  const [isVerifying, setIsVerifying] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  // Na logowaniu bramka ma być niewidoczna: widget z appearance 'interaction-only' sam oddaje
  // token i dopiero gdy Cloudflare zażąda interakcji, pokaże pole do zaznaczenia.
  const [captcha, setCaptcha] = useState<CaptchaConfig | null>(null);
  const [captchaError, setCaptchaError] = useState(false);
  const turnstileRef = useRef<TurnstileWidgetHandle | null>(null);

  // Token trzymany jest w ref, bo kliknięcie może zdarzyć się wcześniej niż go wyda Cloudflare.
  const turnstileTokenRef = useRef('');
  // Stan widżetu zapamiętany po to, żeby kliknięcie nie czekało na token, którego nie będzie.
  const turnstileFailureRef = useRef<TurnstileFailure | null>(null);
  const tokenWaiters = useRef<Array<(token: string) => void>>([]);

  const settleTokenWaiters = (token: string) => {
    const waiters = tokenWaiters.current.splice(0);
    waiters.forEach((resolve) => resolve(token));
  };

  const handleTurnstileToken = (token: string) => {
    turnstileTokenRef.current = token;
    settleTokenWaiters(token);
  };

  const handleTurnstileExpire = () => {
    turnstileTokenRef.current = '';
  };

  const handleTurnstileStatus = (status: TurnstileFailure | 'ready') => {
    turnstileFailureRef.current = status === 'ready' ? null : status;

    // Udany render po ponownej próbie nie rozstrzyga czekania, awaria — owszem.
    if (turnstileFailureRef.current === null) return;
    settleTokenWaiters('');
  };

  const loadCaptcha = () => {
    setCaptchaError(false);
    loadCaptchaConfig()
      .then(setCaptcha)
      .catch(() => setCaptchaError(true));
  };

  useEffect(() => {
    let cancelled = false;

    loadCaptchaConfig()
      .then((config) => {
        if (!cancelled) setCaptcha(config);
      })
      .catch(() => {
        if (!cancelled) setCaptchaError(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const captchaActive = !!captcha?.sitekey;

  /**
   * Czekamy na wynik sprawdzania zamiast o nim informować — komunikat „weryfikacja jeszcze się
   * nie zakończyła" przy niewidocznym widgecie wygląda na awarię aplikacji. Granica jest jednak
   * konieczna i dawna była błędna: po przekroczeniu czasu wysyłaliśmy logowanie bez tokenu, czyli
   * pewny 400 `CAPTCHA_REQUIRED` i czerwony wpis w konsoli. Teraz czekanie kończy się albo tokenem,
   * albo awarią widżetu, albo upływem czasu — a w dwóch ostatnich przypadkach nie wysyłamy nic.
   */
  const waitForTurnstileToken = () => {
    if (turnstileTokenRef.current) return Promise.resolve(turnstileTokenRef.current);
    if (turnstileFailureRef.current) return Promise.resolve('');

    return new Promise<string>((resolve) => {
      tokenWaiters.current.push(resolve);
      window.setTimeout(() => resolve(turnstileTokenRef.current), TURNSTILE_WAIT_MS);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNeedsVerification(false);
    setResendMessage('');
    setIsLoading(true);

    try {
      const waitingForToken = captchaActive && !turnstileTokenRef.current;
      setIsVerifying(waitingForToken);

      const token = captchaActive ? await waitForTurnstileToken() : '';

      if (captchaActive && !token) {
        // Formularz bez tokenu i tak zostałby odrzucony, więc nie wysyłamy go — nauczyciel
        // dostaje to, co może zrobić, a nie komunikat o rzekomym błędzie hasła.
        setError(
          turnstileFailureRef.current
            ? 'Weryfikacja przeciw robotom nie przeszła, więc nie możemy Cię zalogować. Użyj ponownej próby pod hasłem.'
            : 'Kliknij pole weryfikacji pod hasłem i zaloguj jeszcze raz — bez niego nie wiemy, czy piszesz Ty, a nie program.'
        );
        return;
      }

      setIsVerifying(false);
      await login(email, password, token || undefined);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Logowanie nie powiodło się');
      setNeedsVerification(err.code === 'EMAIL_NOT_VERIFIED');
      // Token Turnstile jest jednorazowy: bez resetu druga próba dostałaby timeout-or-duplicate.
      handleTurnstileExpire();
      turnstileRef.current?.reset();
    } finally {
      setIsLoading(false);
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setResendMessage('');

    try {
      await authAPI.resendVerification({ email });
      setResendMessage('Sprawdź skrzynkę — jeśli konto czeka na potwierdzenie, link właśnie poleciał.');
    } catch {
      setResendMessage('Nie udało się wysłać wiadomości. Spróbuj ponownie za chwilę.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F19] py-8 px-4 sm:py-12 sm:px-6 lg:px-8">
      <main id="main-content" tabIndex={-1} className="max-w-md w-full space-y-6 sm:space-y-8">
        {/* Logo */}
        <div className="text-center">
          <BrandMark />
          <h1 className="mt-8 sm:mt-12 text-center text-2xl sm:text-3xl font-bold text-slate-100">
            Zaloguj się
          </h1>

        </div>

        <form className="mt-6 sm:mt-8 space-y-4 sm:space-y-6" onSubmit={handleSubmit}>
          {justVerified && (
            <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl p-3 sm:p-4" role="status">
              <p className="text-sm text-emerald-300">
                Adres email potwierdzony. Zaloguj się na konto.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-3 sm:p-4">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}

          {needsVerification && (
            <div className="bg-amber-950/40 border border-amber-800/50 rounded-xl p-3 sm:p-4 space-y-3">
              <p className="text-sm text-amber-300">
                Link znajdziesz w wiadomości wysłanej na ten adres. Jeśli jej nie ma,
                poproś o nowy link albo sprawdź folder spamu.
              </p>

              {resendMessage && (
                <p className="text-sm text-slate-300" role="status">{resendMessage}</p>
              )}

              <button
                type="button"
                onClick={handleResend}
                disabled={isResending || !email}
                className="w-full flex justify-center py-2.5 px-4 text-sm font-medium rounded-xl text-slate-200 bg-slate-700/50 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer min-h-11"
              >
                {isResending ? 'Wysyłanie…' : 'Wyślij link ponownie'}
              </button>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base"
                placeholder="twoj@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Hasło
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base"
                placeholder="••••••••"
              />
            </div>
          </div>

          {captcha?.sitekey && (
            <TurnstileWidget
              ref={turnstileRef}
              sitekey={captcha.sitekey}
              onToken={handleTurnstileToken}
              onExpire={handleTurnstileExpire}
              onStatus={handleTurnstileStatus}
              appearance="interaction-only"
              hint=""
            />
          )}

          {captchaError && (
            <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-3 sm:p-4">
              <p className="text-sm text-rose-400 leading-relaxed">
                Nie udało się pobrać weryfikacji przeciw robotom, więc logowanie jest zablokowane.
              </p>
              <button
                type="button"
                onClick={loadCaptcha}
                className="mt-2 px-3 py-1.5 text-xs font-medium rounded-xl text-slate-200 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 transition-colors cursor-pointer min-h-11"
              >
                Spróbuj ponownie
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <Link to="/forgot-password" className="font-medium text-blue-400 hover:text-blue-300 transition-colors">
                Nie pamiętasz hasła?
              </Link>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2.5 sm:py-3 px-4 text-sm sm:text-base font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isVerifying
                ? 'Sprawdzam, że nie jesteś robotem…'
                : isLoading
                  ? 'Logowanie…'
                  : 'Zaloguj się'}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-slate-400">
              Nie masz konta?{' '}
              <Link to="/register" className="font-medium text-blue-400 hover:text-blue-300 transition-colors">
                Zarejestruj się
              </Link>
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
