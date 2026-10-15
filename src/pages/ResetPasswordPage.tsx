import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/apiService';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import BrandMark from '../components/BrandMark';
import { apiErrorMessage } from '../utils/apiError';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = acknowledged && newPassword.length >= 8 && newPassword === confirmPassword;

  // Backend przy resecie generuje nowy encryption_salt (authController.ts:219),
  // więc stary klucz przestaje cokolwiek odszyfrowywać — to nieodwracalne.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Brak tokenu w linku. Poproś o nowy link do zmiany hasła.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Nowe hasło musi mieć minimum 8 znaków');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Nowe hasło i jego potwierdzenie muszą być identyczne');
      return;
    }

    setIsSaving(true);

    try {
      await authAPI.resetPassword({ token, newPassword });
      setDone(true);
    } catch (err: any) {
      if (err.response?.status === 400) {
        setError('Link jest nieprawidłowy albo wygasł. Poproś o nowy link do zmiany hasła.');
      } else {
        setError(apiErrorMessage(err, 'Nie udało się ustawić nowego hasła'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    'w-full pl-3 sm:pl-4 pr-12 py-3 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F19] py-8 px-4 sm:py-12 sm:px-6 lg:px-8">
      <main id="main-content" tabIndex={-1} className="max-w-md w-full space-y-6 sm:space-y-8">
        {/* Logo */}
        <div className="text-center">
          <BrandMark />
          <h1 className="mt-8 sm:mt-12 text-center text-2xl sm:text-3xl font-bold text-slate-100">
            Ustaw nowe hasło
          </h1>
        </div>

        {done ? (
          <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl p-4 sm:p-6" role="status">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-slate-100 mb-2">
                  Nowe hasło zapisane
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Możesz się teraz zalogować nowym hasłem.
                </p>
              </div>
            </div>

            <Link
              to="/login"
              className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm sm:text-base font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Zaloguj się
            </Link>
          </div>
        ) : !token ? (
          <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-4 sm:p-6" role="alert">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-slate-100 mb-2">
                  Ten link nie nadaje się do użycia
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Brakuje w nim tokenu zmiany hasła. Poproś o nowy link, albo wróć do logowania.
                </p>
              </div>
            </div>

            <Link
              to="/forgot-password"
              className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm sm:text-base font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              Wyślij nowy link
            </Link>
          </div>
        ) : (
          <form className="space-y-4 sm:space-y-6" onSubmit={handleSubmit} noValidate>
            {/* Ostrzeżenie przed nieodwracalną zmianą */}
            <div className="bg-amber-950/40 border border-amber-800/50 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-200 mb-1">
                    Zanim ustawisz nowe hasło
                  </h3>
                  <p className="text-xs sm:text-sm text-amber-100/90 leading-relaxed">
                    Zmiana hasła powoduje, że <strong>wszystkie imiona i nazwiska uczniów zapisane
                    do tej pory staną się nieczytelne</strong> i trzeba je będzie wpisać od nowa.
                    Tej zmiany nie da się cofnąć.
                  </p>
                </div>
              </div>
            </div>

            <label className="flex items-start gap-3 bg-slate-900/50 border border-slate-800 rounded-xl p-3 sm:p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 w-5 h-5 flex-shrink-0 accent-blue-600"
              />
              <span className="text-sm text-slate-300 leading-relaxed">
                Rozumiem, że po zmianie hasła muszę ponownie wpisać uczniów w swoich klasach.
              </span>
            </label>

            {error && (
              <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-3 sm:p-4" role="alert">
                <p className="text-sm text-rose-400">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-slate-300 mb-2">
                Nowe hasło *
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  name="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Minimum 8 znaków"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
                  title={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                  aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">Minimum 8 znaków</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
                Powtórz nowe hasło *
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 sm:px-4 py-3 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm sm:text-base"
                placeholder="Wpisz hasło jeszcze raz"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving || !canSubmit}
              className="w-full flex justify-center py-3 px-4 text-sm sm:text-base font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0B0F19] focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Zapisywanie…' : 'Ustaw nowe hasło'}
            </button>

            <div className="text-center">
              <p className="text-sm text-slate-400">
                <Link to="/login" className="font-medium text-blue-400 hover:text-blue-300 transition-colors">
                  Wróć do logowania
                </Link>
              </p>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
