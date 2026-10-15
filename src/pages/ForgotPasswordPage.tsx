import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/apiService';
import { loadCaptchaConfig } from '../services/captchaService';
import { toAuthError } from '../contexts/AuthContext';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import BrandMark from '../components/BrandMark';
import TurnstileWidget, { type TurnstileWidgetHandle } from '../components/TurnstileWidget';
import type { CaptchaConfig } from '../types';

// Komunikaty CAPTCHA_* tłumaczy rejestr w utils/apiError.ts — ten sam zestaw kodów
// wraca teraz z rejestracji, logowania i tej strony, więc nie dublujemy mapy na każdym ekranie.
const SEND_FAILURE = 'Nie udało się wysłać linku. Spróbuj jeszcze raz.';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sentTo, setSentTo] = useState('');

  // Widget nie ma co renderować bez sitekeya, a bez widgetu formularz nie ma tokenu —
  // konfigurację czytamy z backendu, bo klucze nie mieszkają w bundlu klienta.
  const [captcha, setCaptcha] = useState<CaptchaConfig | null>(null);
  const [captchaError, setCaptchaError] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<TurnstileWidgetHandle | null>(null);

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
  const captchaLoading = captcha === null && !captchaError;
  const canSubmit = !captchaActive || turnstileToken !== '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Podaj adres email');
      return;
    }

    if (captchaActive && !turnstileToken) {
      setError('Zaznacz, że nie jesteś robotem, żeby wysłać link.');
      return;
    }

    setIsSending(true);

    try {
      await authAPI.forgotPassword({
        email: email.trim(),
        turnstileToken: turnstileToken || undefined,
      });
      setSentTo(email.trim());
    } catch (err: any) {
      setError(toAuthError(err, SEND_FAILURE).message);
      // Token Turnstile zużywa się przy każdej próbie, więc po odrzuconym wysłaniu trzeba
      // dostać nowy — inaczej Cloudflare odda timeout-or-duplicate przy kolejnym kliknięciu.
      setTurnstileToken('');
      turnstileRef.current?.reset();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F19] py-8 px-4 sm:py-12 sm:px-6 lg:px-8">
      <main id="main-content" tabIndex={-1} className="max-w-md w-full space-y-6 sm:space-y-8">
        {/* Logo */}
        <div className="text-center">
          <BrandMark />
          <h1 className="mt-8 sm:mt-12 text-center text-2xl sm:text-3xl font-bold text-slate-100">
            Nie pamiętasz hasła?
          </h1>
          <p className="mt-2 text-center text-sm text-slate-400">
            Podaj swój adres, a wyślemy link do ustawienia nowego hasła
          </p>
        </div>

        {sentTo ? (
          <div
            className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl p-4 sm:p-6"
            role="status"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-slate-100 mb-2">
                  Sprawdź skrzynkę
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Jeśli konto <strong className="text-white">{sentTo}</strong> istnieje,
                  wysłaliśmy na nie link do resetowania hasła. Link jest ważny godzinę.
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  Nic nie przyszło? Zajrzyj do spamu albo spróbuj ponownie za chwilę.
                </p>
              </div>
            </div>

            <Link
              to="/login"
              className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm sm:text-base font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Wróć do logowania
            </Link>
          </div>
        ) : (
          <form className="space-y-4 sm:space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div
                className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-3 sm:p-4"
                role="alert"
              >
                <p className="text-sm text-rose-400">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 sm:pr-4 py-3 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base"
                  placeholder="twoj@email.com"
                />
              </div>
            </div>

            {captcha?.sitekey && (
              <TurnstileWidget
                ref={turnstileRef}
                sitekey={captcha.sitekey}
                onToken={setTurnstileToken}
                onExpire={() => setTurnstileToken('')}
              />
            )}

            {captchaLoading && (
              <p className="text-xs text-slate-400" role="status">
                Wczytywanie weryfikacji przeciw robotom…
              </p>
            )}

            {captchaError && (
              <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-3 sm:p-4">
                <p className="text-sm text-rose-400 leading-relaxed">
                  Nie udało się pobrać weryfikacji przeciw robotom, więc formularz jest zablokowany.
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

            <button
              type="submit"
              disabled={isSending || !canSubmit}
              className="w-full flex justify-center py-3 px-4 text-sm sm:text-base font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0B0F19] focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSending ? 'Wysyłanie linku…' : 'Wyślij link'}
            </button>

            {!canSubmit && (
              <p className="text-xs text-slate-400">
                Potwierdź, że nie jesteś robotem, żeby aktywować przycisk.
              </p>
            )}

            <div className="text-center">
              <p className="text-sm text-slate-400">
                Pamiętasz hasło?{' '}
                <Link
                  to="/login"
                  className="font-medium text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Zaloguj się
                </Link>
              </p>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
