import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/apiService';
import { CheckCircle2, Mail, Loader2, AlertTriangle } from 'lucide-react';
import BrandMark from '../components/BrandMark';

type Status = 'verifying' | 'verified' | 'invalid' | 'error';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>('verifying');
  const [email, setEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  // Token jest jednorazowy, a StrictMode wywołuje efekt drugi raz w dev —
  // bez tego guarda drugie żądanie dostałoby "link nieprawidłowy".
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setStatus('invalid');
      return;
    }

    authAPI
      .verifyEmail({ token })
      .then(() => setStatus('verified'))
      .catch((err: any) => {
        setStatus(err.response?.status === 400 ? 'invalid' : 'error');
      });
  }, [searchParams]);

  const handleResend = async (e: FormEvent) => {
    e.preventDefault();
    setIsResending(true);
    setResendMessage('');

    try {
      await authAPI.resendVerification({ email });
      setResendMessage('Jeśli konto czeka na potwierdzenie, wysłaliśmy nowy link.');
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
        </div>

        <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-5 sm:p-6" aria-live="polite">
          {status === 'verifying' && (
            <div className="text-center py-6 space-y-4">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin motion-reduce:animate-none mx-auto" />
              <h1 className="text-sm sm:text-base text-slate-300">Potwierdzamy Twój adres email…</h1>
            </div>
          )}

          {status === 'verified' && (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-white">Adres email potwierdzony</h1>
              <p className="text-sm text-slate-400 leading-relaxed">
                Konto jest aktywne. Zaloguj się, aby zacząć sprawdzać prace.
              </p>
              <Link
                to="/login?verified=1"
                className="w-full flex justify-center py-2.5 sm:py-3 px-4 text-sm sm:text-base font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors cursor-pointer min-h-11"
              >
                Przejdź do logowania
              </Link>
            </div>
          )}

          {(status === 'invalid' || status === 'error') && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <h1 className="text-base sm:text-lg font-semibold text-white">
                  {status === 'invalid' ? 'Link nie działa' : 'Nie udało się potwierdzić adresu'}
                </h1>
              </div>

              <p className="text-sm text-slate-400 leading-relaxed">
                {status === 'invalid'
                  ? 'Link jest nieprawidłowy albo już wygasł. Poproś o nowy link poniżej.'
                  : 'Coś poszło nie tak po naszej stronie. Poproś o nowy link i spróbuj ponownie.'}
              </p>

              <form onSubmit={handleResend} className="space-y-3">
                <div>
                  <label htmlFor="resend-email" className="block text-sm font-medium text-slate-300 mb-2">
                    Adres email z konta
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="resend-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-3 sm:pr-4 py-2.5 sm:py-3 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base"
                      placeholder="twoj@email.com"
                    />
                  </div>
                </div>

                {resendMessage && (
                  <p className="text-sm text-slate-300" role="status">{resendMessage}</p>
                )}

                <button
                  type="submit"
                  disabled={isResending}
                  className="w-full flex justify-center py-2.5 sm:py-3 px-4 text-sm sm:text-base font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer min-h-11"
                >
                  {isResending ? 'Wysyłanie…' : 'Wyślij nowy link'}
                </button>
              </form>

              <p className="text-sm text-slate-400 text-center">
                <Link to="/login" className="font-medium text-blue-400 hover:text-blue-300 transition-colors">
                  Wróć do logowania
                </Link>
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
