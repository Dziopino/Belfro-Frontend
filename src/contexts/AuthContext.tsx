import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authAPI, setUnauthorizedHandler } from '../services/apiService';
import type { User, RegisterRequest, RegisterResponse } from '../types';
import { initializeKey, clearKey, isKeyInitialized } from '../services/cryptoService';
import { apiCodeMessage, apiErrorCode, apiErrorMessage } from '../utils/apiError';

// Tłumaczenie błędów API mieszka w utils/apiError.ts — stamtąd korzystają też strony, więc
// jeden kod nie może być przetłumaczony w jednym miejscu i surowy w drugim.
export function toAuthError(error: any, fallback: string): Error & { code?: string } {
  const code = apiErrorCode(error);

  // Gałąź za kodem to błąd rzucony lokalnie, nie przez HTTP: np. initializeKey w login
  // (AuthContext.tsx:105) woła cryptoService, a ten rzuca polski Error bez `response`.
  // Bez tego nauczyciel czytał „Logowanie nie powiodło się”, choć token był już zapisany,
  // a winny był klucz szyfrujący. Odfiltrowanie axiosa chroni przed jego angielskimi
  // komunikatami („Network Error”, „Request failed with status code 400”).
  const localMessage =
    !error.response && !error.isAxiosError && typeof error.message === 'string' && error.message.trim()
      ? error.message
      : undefined;

  const err = new Error(
    apiCodeMessage(code, error) ?? localMessage ?? apiErrorMessage(error, fallback)
  ) as Error & { code?: string };
  err.code = code;
  return err;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, turnstileToken?: string) => Promise<void>;
  register: (data: RegisterRequest) => Promise<RegisterResponse>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * 401 z dowolnego endpointa chronionego. Wcześniejsze przeładowanie strony kasowało przy
   * okazji formularz, w którym nauczyciel właśnie pisał hasło, i jednorazowy token Turnstile.
   * Tu tylko zgłaszamy utratę sesji — ProtectedRoute sam przekieruje na /login, bo `isAuthenticated`
   * wynika z stanu użytkownika i z obecnego klucza.
   */
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      clearKey();
    });

    return () => setUnauthorizedHandler(null);
  }, []);

  // Sprawdź czy użytkownik jest już zalogowany przy starcie aplikacji
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        try {
          const { user: userData } = await authAPI.getCurrentUser();
          setUser(userData);

          // UWAGA: Po odświeżeniu strony klucz kryptograficzny jest utracony!
          // Użytkownik będzie musiał się przelogować, aby odtworzyć klucz w RAM
          // (lub możemy dodać opcję "Remember me" z dodatkowym hasłem)
        } catch {
          // Odzyskiwanie sesji nie udaje się z dwóch zupełnie różnych powodów i przy obu nie mamy
          // nic do zrobienia: wygasły JWT kasuje już interceptor w apiService.ts:82, a awaria
          // sieci albo chwilowo niedostępne API nie mogą kasować tokenu, bo nauczyciel
          // musiałby wpisywać hasło od nowa bez powodu. Dawniej oba kończyły się czerwonym
          // console.error na panelu logowania.
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  /**
   * Logowanie użytkownika
   * KRYTYCZNE: Tutaj generujemy klucz kryptograficzny w RAM
   */
  const login = async (email: string, password: string, turnstileToken?: string) => {
    try {
      const response = await authAPI.login({ email, password, turnstileToken });

      // Zapisz token JWT w localStorage
      localStorage.setItem('auth_token', response.token);

      // KLUCZOWY MOMENT: Inicjalizuj klucz szyfrujący w pamięci RAM
      // Używamy hasła użytkownika + encryption_salt z backendu
      // PBKDF2 trwa ~100 ms, więc klucz musi być gotowy PRZED setUser —
      // isAuthenticated czyta stan modułu kryptograficznego, a ten render jest jedyny.
      await initializeKey(password, response.user.encryption_salt);

      // Zapisz dane użytkownika w state
      setUser(response.user);
    } catch (error: any) {
      // Nie logujemy: `toAuthError` zamienia ten błąd na polską przyczynę, którą formularz pokazuje
      // nauczycielowi, a powtórka w konsoli była tylko czerwonym szumem przy każdym złym haśle.
      throw toAuthError(error, 'Logowanie nie powiodło się');
    }
  };

  /**
   * Rejestracja nowego użytkownika.
   * Świadomie bez zakładania sesji: klucz E2E wynika z hasła, więc i tak powstałby
   * dopiero przy pierwszym logowaniu po potwierdzeniu adresu.
   * Telefon zapisujemy od razu, ale kod SMS przysyłamy dopiero po logowaniu — patrz backend/sendSmsCode.
   * `accountKind` wędruje dalej bez przeglądu: backend nie ma wartości domyślnej dla typu konta.
   */
  const register = async (data: RegisterRequest) => {
    try {
      return await authAPI.register(data);
    } catch (error: any) {
      throw toAuthError(error, 'Rejestracja nie powiodła się');
    }
  };

  /**
   * Wylogowanie użytkownika
   * KRYTYCZNE: Czyścimy klucz kryptograficzny z pamięci RAM
   */
  const logout = () => {
    // Usuń token JWT
    localStorage.removeItem('auth_token');

    // Wyczyść state
    setUser(null);

    // KLUCZOWY MOMENT: Wyczyść klucz szyfrujący z pamięci RAM
    clearKey();
  };

  /**
   * Odśwież dane użytkownika z backendu
   */
  const refreshUser = async () => {
    try {
      const { user: userData } = await authAPI.getCurrentUser();
      setUser(userData);
    } catch (error) {
      console.error('Nie udało się odświeżyć danych nauczyciela:', error);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user && isKeyInitialized(),
    isLoading,
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook do użycia AuthContext
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
