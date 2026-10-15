import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Komponent chroniący routing przed nieautoryzowanym dostępem
 * Przekierowuje niezalogowanych użytkowników na stronę logowania
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" className="min-h-screen flex items-center justify-center bg-[#0B0F19]">
        <div className="text-center">
          <div
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"
          ></div>
          <p className="text-slate-400">Ładowanie…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Zapisz obecną lokalizację, aby móc przekierować po zalogowaniu
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Bramka kontaktu po stronie klienta. Porównanie jest celowo ścisłe do false: konta założone przed
  // weryfikacją telefonu mają is_phone_verified = true bez numeru i przechodzą dalej,
  // a brak pola (odpowiedź sprzed migracji) nie może zamykać nikomu dostępu.
  if (user?.is_phone_verified === false) {
    return <Navigate to="/verify-phone" replace />;
  }

  return <>{children}</>;
}
