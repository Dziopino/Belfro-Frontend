import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/apiService';
import { loadCaptchaConfig } from '../services/captchaService';
import { CheckCircle2 } from 'lucide-react';
import BrandMark from '../components/BrandMark';
import TurnstileWidget, { type TurnstileWidgetHandle } from '../components/TurnstileWidget';
import type { AccountKind, CaptchaConfig } from '../types';

/**
 * Polski numer komórkowy w E.164 (+48XXXXXXXXX) albo null.
 * Ta sama reguła co backend/src/utils/phone.ts — dwa różne zapisy tego samego numeru oznaczałyby
 * dwa konta na jeden telefon, a to jest dokładnie ta bramka, którą budujemy.
 */
function normalizePolishPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');

  let body: string;
  if (digits.length === 12 && digits.startsWith('0048')) body = digits.slice(4);
  else if (digits.length === 11 && digits.startsWith('48')) body = digits.slice(2);
  else if (digits.length === 9) body = digits;
  else return null;

  return /^[1-9]\d{8}$/.test(body) ? `+48${body}` : null;
}

const PHONE_HINT = 'Podaj polski numer komórkowy w formacie +48 600 700 800';

const CONSENT_TEXT =
  'Wyrażam zgodę na przetwarzanie mojego numeru telefonu przez Belfero wyłącznie w celu weryfikacji konta i zapobiegania nadużyciom polegającym na wielokrotnym zakładaniu konta w celu uzyskania darmowego dostępu. Podanie numeru jest dobrowolne, ale konieczne, aby korzystać z aplikacji.';

/**
 * Dwa rodzaje konta. Kolejność nie jest przypadkowa: najpierw staje nauczyciel, który umowy ze
 * szkołą nie ma, bo to on musi świadomie wybrać listę bez nazwisk.
 */
const ACCOUNT_KIND_OPTIONS: { value: AccountKind; title: string; description: string }[] = [
  {
    value: 'private',
    title: 'Nauczyciel prywatny',
    description:
      'Sprawdzasz prace na własną rękę, bez umowy powierzenia ze szkołą. Uczniów oznaczasz tylko numerem z dziennika, a imiona i nazwiska nie trafiają do bazy nawet w formie zaszyfrowanej.',
  },
  {
    value: 'school',
    title: 'Szkoła — z umową powierzenia',
    description:
      'Szkoła powierzyła Ci dane uczniów na piśmie. Lista uczniów zostaje jak dotąd: imię, nazwisko i numer z dziennika, wszystko zaszyfrowane w Twojej przeglądarce.',
  },
];

const ACCOUNT_KIND_MISSING = 'Zaznacz, czy konto zakłada nauczyciel prywatny, czy szkoła.';

export default function RegisterPage() {
  const { register } = useAuth();

  const [email, setEmail] = useState('');
  // Pusto znaczy „nauczyciel jeszcze nie powiedział, czy ma umowę ze szkołą". Żaden z dwóch
  // sposobów przechowywania danych nie może być kliknięty za niego domyślnie.
  const [accountKind, setAccountKind] = useState<AccountKind | ''>('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Adres, na który poszedł link — po jego ustawieniu pokazujemy panel zamiast formularza
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

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

  const normalizedPhone = normalizePolishPhone(phone);
  const canSubmit =
    accountKind !== '' && normalizedPhone !== null && consent && (!captchaActive || turnstileToken !== '');

  // Karta planu na dole nie może obiecywać ochrony, której wybrany rodzaj konta nie daje:
  // u prywatnego nauczyciela nazwisk po prostu nie ma, u szkolnego są szyfrowane w przeglądarce.
  const rosterBullet =
    accountKind === 'private'
      ? 'Uczniowie bez nazwisk — tylko numer z dziennika'
      : accountKind === 'school'
        ? 'Imiona i nazwiska szyfrowane w Twojej przeglądarce'
        : 'Dane uczniów są chronione';

  // Przy blur pokazujemy to, co realnie trafi do bazy — nauczyciel widzi numer w tej postaci,
  // w jakiej zostanie zapisany, więc nie dziwi go później maska +48*******80.
  const handlePhoneBlur = () => {
    if (normalizedPhone) setPhone(normalizedPhone);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Walidacja
    if (!accountKind) {
      setError(ACCOUNT_KIND_MISSING);
      return;
    }

    if (password.length < 8) {
      setError('Hasło musi mieć minimum 8 znaków');
      return;
    }

    if (password !== confirmPassword) {
      setError('Hasła nie są identyczne');
      return;
    }

    if (!normalizedPhone) {
      setError(PHONE_HINT);
      return;
    }

    if (!consent) {
      setError('Zgoda na przetwarzanie numeru telefonu jest wymagana, aby utworzyć konto.');
      return;
    }

    if (captchaActive && !turnstileToken) {
      setError('Zaznacz, że nie jesteś robotem, żeby utworzyć konto.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await register({
        email,
        password,
        phone: normalizedPhone,
        phoneConsent: consent,
        accountKind,
        turnstileToken: turnstileToken || undefined,
      });
      setRegisteredEmail(response.email);
    } catch (err: any) {
      setError(err.message || 'Rejestracja nie powiodła się');
      // Token Turnstile zużywa się przy każdej próbie, więc po odrzuconej rejestracji (nawet
      // takiej jak zajęty numer) trzeba dostać nowy — inaczej Cloudflare odda timeout-or-duplicate.
      setTurnstileToken('');
      turnstileRef.current?.reset();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setResendMessage('');

    try {
      await authAPI.resendVerification({ email: registeredEmail });
      setResendMessage('Jeśli konto nadal czeka na potwierdzenie, właśnie wysłaliśmy nowy link.');
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
          <h1 className="mt-4 sm:mt-6 text-center text-2xl sm:text-3xl font-bold text-slate-100">
            {registeredEmail ? 'Potwierdź adres email' : 'Utwórz konto'}
          </h1>
          {!registeredEmail && (
            <p className="mt-2 text-center text-sm text-slate-400">
              Zacznij sprawdzać prace szybciej z AI
            </p>
          )}
        </div>

        {registeredEmail ? (
          <div className="mt-6 sm:mt-8 bg-[#131B2E] border border-slate-800/60 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-white">
                Wiadomość została wysłana
              </h3>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              Na adres{' '}
              <span className="font-medium text-white break-words">{registeredEmail}</span>{' '}
              został wysłany link potwierdzający. Kliknij go, aby aktywować konto.
            </p>

            <p className="text-sm text-slate-400 leading-relaxed">
              Po kliknięciu linku, przy pierwszym logowaniu, poprosimy jeszcze o potwierdzenie numeru
              telefonu kodem SMS. Kod przychodzi wyłącznie na numer podany w formularzu.
            </p>

            <p className="text-sm text-slate-400 leading-relaxed">
              Wiadomość się nie pokazała? Zajrzyj do spamu albo poproś o nowy link.
              Obecny link wygasa po 24 godzinach.
            </p>

            {resendMessage && (
              <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl p-3" role="status">
                <p className="text-sm text-blue-300">{resendMessage}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleResend}
              disabled={isResending}
              className="w-full flex justify-center py-2.5 sm:py-3 px-4 text-sm sm:text-base font-medium rounded-xl text-slate-200 bg-slate-700/50 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer min-h-11"
            >
              {isResending ? 'Wysyłanie…' : 'Wyślij link ponownie'}
            </button>

            <div className="text-center">
              <p className="text-sm text-slate-400">
                Po potwierdzeniu adresu{' '}
                <Link to="/login" className="font-medium text-blue-400 hover:text-blue-300 transition-colors">
                  zaloguj się
                </Link>
              </p>
            </div>
          </div>
        ) : (
          <>
        <form className="mt-6 sm:mt-8 space-y-4 sm:space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-3 sm:p-4">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}

          <fieldset className="space-y-3">
            <legend className="block text-sm font-medium text-slate-300">Rodzaj konta</legend>

            {ACCOUNT_KIND_OPTIONS.map((option) => {
              const isSelected = accountKind === option.value;

              return (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#1A2338] border-blue-500'
                      : 'bg-[#131B2E] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="account-kind"
                    value={option.value}
                    checked={isSelected}
                    onChange={() => setAccountKind(option.value)}
                    className="mt-0.5 w-5 h-5 shrink-0 cursor-pointer accent-blue-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-sm sm:text-base font-medium text-slate-100">{option.title}</span>
                    <span className="block text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}

            <p className="text-xs text-slate-400 leading-relaxed">
              To deklaracja o tym, co wolno nam przechowywać. Późniejsza zmiana wymaga kontaktu z
              nami, bo klas już założonych nie da się przepisać na drugi sposób oznaczania uczniów.
            </p>
          </fieldset>

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
              <label htmlFor="phone" className="block text-sm font-medium text-slate-300 mb-2">
                Numer telefonu
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={handlePhoneBlur}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base tabular-nums"
                placeholder="+48 600 700 800"
              />
              <p className="mt-1.5 text-xs text-slate-400">{PHONE_HINT}</p>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Hasło
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base"
                placeholder="••••••••"
              />
              <p className="mt-1.5 text-xs text-slate-400">Minimum 8 znaków</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
                Potwierdź hasło
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="flex items-start gap-3">
            <input
              id="phoneConsent"
              name="phoneConsent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 w-4 h-4 sm:w-5 sm:h-5 rounded border-slate-700 bg-[#1A2338] text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
            />
            <label htmlFor="phoneConsent" className="text-xs sm:text-sm text-slate-400 leading-relaxed cursor-pointer">
              {CONSENT_TEXT}
            </label>
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

          {!canSubmit && (
            <p className="text-xs text-slate-400" role="status">
              Zaznacz rodzaj konta, wpisz poprawny numer telefonu, zaznacz zgodę i potwierdź, że nie
              jesteś robotem, żeby aktywować przycisk.
            </p>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading || !canSubmit}
              className="w-full flex justify-center py-2.5 sm:py-3 px-4 text-sm sm:text-base font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer min-h-11"
            >
              {isLoading ? 'Rejestracja…' : 'Zarejestruj się'}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-slate-400">
              Masz już konto?{' '}
              <Link to="/login" className="font-medium text-blue-400 hover:text-blue-300 transition-colors">
                Zaloguj się
              </Link>
            </p>
          </div>
        </form>

        {/* Plan Card */}
        <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl p-3 sm:p-4">
          <div className="flex items-start gap-2 sm:gap-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-white mb-2">
                Darmowy plan startowy
              </h3>
              <ul className="text-xs text-slate-400 space-y-1">
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-emerald-400 rounded-full flex-shrink-0"></span>
                  <span>350 stron sprawdzania/miesiąc</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-emerald-400 rounded-full flex-shrink-0"></span>
                  <span>Nieograniczona liczba klas i uczniów</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-emerald-400 rounded-full flex-shrink-0"></span>
                  <span>{rosterBullet}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-emerald-400 rounded-full flex-shrink-0"></span>
                  <span>Eksport PDF z komentarzami AI</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
          </>
        )}
      </main>
    </div>
  );
}
