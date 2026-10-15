import axios from 'axios';
import type {
  User,
  RegisterRequest,
  RegisterResponse,
  CaptchaConfig,
  LoginRequest,
  LoginResponse,
  SendSmsCodeResponse,
  VerifySmsCodeResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ResetPasswordResponse,
  Class,
  Student,
  CreateClassRequest,
  CreateStudentRequest,
  UpdateStudentRequest,
  AppendStudentsRequest,
  GradingSession,
  CreateGradingSessionRequest,
  CreateSessionGroupRequest,
  Grade,
  GradingSessionSummary,
  GradingSessionProgress,
  UpdateGradeRequest,
  GradeThreshold,
  CreateThresholdRequest,
  UpdateThresholdRequest,
  AnswerKeyRecord,
  AnswerKeySummary,
  CreateAnswerKeyRequest,
  UpdateAnswerKeyRequest,
  WalletResponse,
  AccountUpdateRequest,
  AccountUpdateResponse,
} from '../types';

// Eksportowane: strony plików (np. skany prac) muszą zbudować adres z originu API,
// a nie z baseURL, bo ten kończy się na /api.
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Axios instance z bazową konfiguracją
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor do automatycznego dodawania JWT token do requestów
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Rejestruje ją AuthContext, bo tylko on potrafi wyczyścić klucz E2E trzymany w RAM.
 * Bez tego wskaźnika 401 musiałoby kończyć się przeładowaniem strony — a to kasuje formularz
 * i jednorazowy token Turnstile.
 */
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

// Interceptor do obsługi błędów (np. wygaśnięcie tokenu)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl: string = error.config?.url ?? '';

    // 401 z logowania to źle wpisane dane, nie utracona sesja — formularz obsługuje je sam,
    // a wylogowanie przy okazji błędnego hasła zabrałoby sesję także nauczycielowi, który jest zalogowany.
    if (error.response?.status === 401 && !requestUrl.endsWith('/auth/login')) {
      localStorage.removeItem('auth_token');
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  }
);

// ============================================
// Auth API
// ============================================

export const authAPI = {
  /**
   * Konfiguracja bramki antybotowej. Bez sitekeya formularz nie renderuje widgetu, więc
   * rejestracja, logowanie i prośba o link do resetu hasła pytają o nią jako o pierwszą rzecz.
   */
  getCaptchaConfig: async (): Promise<CaptchaConfig> => {
    const response = await apiClient.get<CaptchaConfig>('/auth/captcha-config');
    return response.data;
  },

  /**
   * Rejestracja nowego użytkownika
   */
  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const response = await apiClient.post<RegisterResponse>('/auth/register', data);
    return response.data;
  },

  /**
   * Logowanie użytkownika
   */
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/login', data);
    return response.data;
  },

  /**
   * Wysłanie emaila z linkiem do resetowania hasła
   */
  forgotPassword: async (data: ForgotPasswordRequest): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/auth/forgot-password', data);
    return response.data;
  },

  /**
   * Resetowanie hasła używając tokenu z emaila
   */
  resetPassword: async (data: ResetPasswordRequest): Promise<ResetPasswordResponse> => {
    const response = await apiClient.post<ResetPasswordResponse>('/auth/reset-password', data);
    return response.data;
  },

  /**
   * Potwierdzenie adresu email tokenem z linku
   */
  verifyEmail: async (data: { token: string }): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/auth/verify-email', data);
    return response.data;
  },

  /**
   * Ponowne wysłanie linku potwierdzającego
   */
  resendVerification: async (data: ForgotPasswordRequest): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/auth/resend-verification', data);
    return response.data;
  },

  /**
   * Prośba o kod SMS na numer zapisany na koncie.
   * Bez parametru: adresata wskazuje rekord za tokenem, więc request nie może wskazać cudzego numeru.
   */
  sendSmsCode: async (): Promise<SendSmsCodeResponse> => {
    const response = await apiClient.post<SendSmsCodeResponse>('/auth/send-sms-code');
    return response.data;
  },

  /**
   * Potwierdzenie kodu SMS. Udało się — konto przechodzi bramkę kontaktu.
   */
  verifySmsCode: async (data: { code: string }): Promise<VerifySmsCodeResponse> => {
    const response = await apiClient.post<VerifySmsCodeResponse>('/auth/verify-sms-code', data);
    return response.data;
  },

  /**
   * Pobranie danych zalogowanego użytkownika
   */
  getCurrentUser: async (): Promise<{ user: User }> => {
    const response = await apiClient.get<{ user: User }>('/auth/me');
    return response.data;
  },
};

// ============================================
// Classes API
// ============================================

export const classesAPI = {
  /**
   * Pobiera wszystkie klasy użytkownika
   */
  getClasses: async (): Promise<{ classes: Class[] }> => {
    const response = await apiClient.get<{ classes: Class[] }>('/classes');
    return response.data;
  },

  /**
   * Tworzy nową klasę (nazwa jest już zaszyfrowana po stronie klienta)
   */
  createClass: async (data: CreateClassRequest): Promise<{ class: Class }> => {
    const response = await apiClient.post<{ class: Class }>('/classes', data);
    return response.data;
  },

  /**
   * Pobiera szczegóły klasy wraz z uczniami
   */
  getClass: async (classId: string): Promise<{ class: Class }> => {
    const response = await apiClient.get<{ class: Class }>(`/classes/${classId}`);
    return response.data;
  },

  /**
   * Usuwa klasę
   */
  deleteClass: async (classId: string): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`/classes/${classId}`);
    return response.data;
  },
};

// ============================================
// Students API
// ============================================

export const studentsAPI = {
  /**
   * Pobiera wszystkich uczniów z klasy
   */
  getStudents: async (classId: string): Promise<{ students: Student[] }> => {
    const response = await apiClient.get<{ students: Student[] }>(`/classes/${classId}/students`);
    return response.data;
  },

  /**
   * Dodaje ucznia do klasy (dane już zaszyfrowane po stronie klienta)
   */
  createStudent: async (classId: string, data: CreateStudentRequest): Promise<{ student: Student }> => {
    const response = await apiClient.post<{ student: Student }>(`/classes/${classId}/students`, data);
    return response.data;
  },

  /**
   * Dokłada uczniów do klasy numerowanej: backend nadaje numery za największym zajętym, więc
   * klasa nie musi być zakładana od nowa, gdy w połowie roku doszło dziecko.
   */
  appendStudents: async (
    classId: string,
    data: AppendStudentsRequest
  ): Promise<{ students: Student[] }> => {
    const response = await apiClient.post<{ students: Student[] }>(
      `/classes/${classId}/students/append`,
      data
    );
    return response.data;
  },

  /**
   * Aktualizuje dane ucznia
   */
  updateStudent: async (studentId: string, data: UpdateStudentRequest): Promise<{ student: Student }> => {
    const response = await apiClient.put<{ student: Student }>(`/students/${studentId}`, data);
    return response.data;
  },

  /**
   * Usuwa ucznia
   */
  deleteStudent: async (studentId: string): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`/students/${studentId}`);
    return response.data;
  },
};

// ============================================
// Grading Session API
// ============================================

export const gradingAPI = {
  /**
   * Tworzy nową sesję sprawdzania
   */
  createSession: async (data: CreateGradingSessionRequest): Promise<{ session: GradingSession }> => {
    const response = await apiClient.post<{ session: GradingSession }>('/grading/sessions', data);
    return response.data;
  },

  /**
   * Lista sesji do historii sprawdzania prac (najnowsze pierwsze)
   */
  getSessions: async (
    params?: { limit?: number; offset?: number }
  ): Promise<{ sessions: GradingSessionSummary[]; total_count: number }> => {
    const response = await apiClient.get<{ sessions: GradingSessionSummary[]; total_count: number }>(
      '/grading/sessions',
      { params }
    );
    return response.data;
  },

  /**
   * Pobiera szczegóły sesji sprawdzania
   */
  getSession: async (sessionId: string): Promise<{ session: GradingSession }> => {
    const response = await apiClient.get<{ session: GradingSession }>(`/grading/sessions/${sessionId}`);
    return response.data;
  },

  /**
   * Licznik sprawdzonych prac do paska postępu. Osobny od getSession, bo UI pyta o niego co
   * kilka sekund, a pełna sesja niesie ai_response każdej pracy.
   */
  getSessionProgress: async (sessionId: string): Promise<GradingSessionProgress> => {
    const response = await apiClient.get<GradingSessionProgress>(
      `/grading/sessions/${sessionId}/progress`
    );
    return response.data;
  },

  /**
   * Nadpisuje listę nieobecnych w sesji. Wysyłamy całą listę, nie różnicę, więc powtórne
   * zapisanie tej samej wartości jest nieszkodliwe.
   */
  updateSessionAbsent: async (sessionId: string, absentStudentIds: string[]): Promise<{ session: GradingSession }> => {
    const response = await apiClient.patch<{ session: GradingSession }>(`/grading/sessions/${sessionId}`, {
      absent_student_ids: absentStudentIds,
    });
    return response.data;
  },

  /**
   * Nadpisuje przydział uczniów do grup w już zapisanej sesji razem z listą nieobecnych. Jedno
   * żądanie, żeby odznaczenie nieobecności nie zostało w bazie bez przydzielonego wariantu.
   * Muszą tu trafić WSZYSTKIE grupy sesji: serwer przepisuje wyłącznie `student_ids` istniejących
   * wierszy, a nazwy, kolejność i zamrożony klucz każdej grupy pozostawia bez zmian.
   */
  updateSessionGroups: async (
    sessionId: string,
    groups: CreateSessionGroupRequest[],
    absentStudentIds: string[]
  ): Promise<{ session: GradingSession }> => {
    const response = await apiClient.patch<{ session: GradingSession }>(`/grading/sessions/${sessionId}`, {
      groups,
      absent_student_ids: absentStudentIds,
    });
    return response.data;
  },

  /**
   * Bezpowrotnie usuwa sesję razem z ocenami i zanonimizowanymi skanami prac.
   */
  deleteSession: async (sessionId: string): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`/grading/sessions/${sessionId}`);
    return response.data;
  },

  /**
   * Zapisuje poprawki nauczyciela do oceny pracy (punkty, komentarze, weryfikacja).
   * Wskazanie wariantu zwraca dodatkowo `regraded`: praca poszła przez AI od nowa z tym kluczem.
   */
  updateGrade: async (
    sessionId: string,
    gradeId: string,
    data: UpdateGradeRequest
  ): Promise<{ grade: Grade; variant_name?: string; regraded?: boolean }> => {
    const response = await apiClient.patch<{ grade: Grade; variant_name?: string; regraded?: boolean }>(
      `/grading/sessions/${sessionId}/grades/${gradeId}`,
      data
    );
    return response.data;
  },

  /**
   * Upload i anonimizacja obrazu pracy ucznia
   */
  uploadImage: async (
    sessionId: string,
    studentId: string,
    image: File,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<{ message: string; grade_id: string; image_path: string }> => {
    const formData = new FormData();
    formData.append('image', image);
    formData.append('session_id', sessionId);
    formData.append('student_id', studentId);
    formData.append('x', x.toString());
    formData.append('y', y.toString());
    formData.append('width', width.toString());
    formData.append('height', height.toString());

    const response = await apiClient.post('/grading/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Przetwarza sesję przez AI (wszystkie prace)
   */
  processSession: async (
    sessionId: string
  ): Promise<{
    message: string;
    processed_count: number;
    total_count: number;
    awaiting_variant_count?: number;
  }> => {
    const response = await apiClient.post(`/grading/sessions/${sessionId}/process`);
    return response.data;
  },
};

// ============================================
// Grade Thresholds API
// ============================================

export const thresholdsAPI = {
  /**
   * Pobiera wszystkie skale progów ocen użytkownika
   */
  getThresholds: async (): Promise<{ thresholds: GradeThreshold[] }> => {
    const response = await apiClient.get<{ thresholds: GradeThreshold[] }>('/thresholds');
    return response.data;
  },

  /**
   * Tworzy nową skalę progów ocen
   */
  createThreshold: async (data: CreateThresholdRequest): Promise<{ threshold: GradeThreshold }> => {
    const response = await apiClient.post<{ threshold: GradeThreshold }>('/thresholds', data);
    return response.data;
  },

  /**
   * Aktualizuje skalę progów ocen
   */
  updateThreshold: async (thresholdId: string, data: UpdateThresholdRequest): Promise<{ threshold: GradeThreshold }> => {
    const response = await apiClient.put<{ threshold: GradeThreshold }>(`/thresholds/${thresholdId}`, data);
    return response.data;
  },

  /**
   * Usuwa skalę progów ocen
   */
  deleteThreshold: async (thresholdId: string): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`/thresholds/${thresholdId}`);
    return response.data;
  },
};

// ============================================
// Answer Keys API (biblioteka kluczy odpowiedzi)
// ============================================

export const answerKeysAPI = {
  /**
   * Pobiera listę kluczy odpowiedzi bez treści zadań
   */
  getAnswerKeys: async (): Promise<{ answer_keys: AnswerKeySummary[] }> => {
    const response = await apiClient.get<{ answer_keys: AnswerKeySummary[] }>('/answer-keys');
    return response.data;
  },

  /**
   * Pobiera pełny klucz odpowiedzi (z zadaniami)
   */
  getAnswerKey: async (keyId: string): Promise<{ answer_key: AnswerKeyRecord }> => {
    const response = await apiClient.get<{ answer_key: AnswerKeyRecord }>(`/answer-keys/${keyId}`);
    return response.data;
  },

  /**
   * Tworzy nowy klucz w bibliotece
   */
  createAnswerKey: async (data: CreateAnswerKeyRequest): Promise<{ answer_key: AnswerKeyRecord }> => {
    const response = await apiClient.post<{ answer_key: AnswerKeyRecord }>('/answer-keys', data);
    return response.data;
  },

  /**
   * Aktualizuje klucz odpowiedzi
   */
  updateAnswerKey: async (
    keyId: string,
    data: UpdateAnswerKeyRequest
  ): Promise<{ answer_key: AnswerKeyRecord }> => {
    const response = await apiClient.patch<{ answer_key: AnswerKeyRecord }>(
      `/answer-keys/${keyId}`,
      data
    );
    return response.data;
  },

  /**
   * Usuwa klucz z biblioteki (sprawdzone sesje zachowują swój snapshot)
   */
  deleteAnswerKey: async (keyId: string): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`/answer-keys/${keyId}`);
    return response.data;
  },
};

export const walletAPI = {
  /**
   * Saldo stron i cennik pakietów. Ceny pochodzą z backendu, więc nie ma ich w bundlu.
   */
  getWallet: async (): Promise<WalletResponse> => {
    const response = await apiClient.get<WalletResponse>('/wallet');
    return response.data;
  },
};

export const accountAPI = {
  /**
   * Zapis ustawień konta. Wysyłamy wyłącznie zmienione pola — backend rusza tylko to, co przyszło.
   */
  updateAccount: async (data: AccountUpdateRequest): Promise<AccountUpdateResponse> => {
    const response = await apiClient.patch<AccountUpdateResponse>('/account', data);
    return response.data;
  },
};

export default apiClient;
