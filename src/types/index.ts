// ============================================
// Auth Types — kształty odpowiedzi z backendu (controllers/authController.ts)
// ============================================

/**
 * Jak rozstrzygamy wariant arkusza. 'manual' to przydział nauczyciela (grading_session_groups),
 * 'ai' zamraża wszystkie warianty klucza na sesji i każe modelowi poznać wariant ze skanu —
 * wtedy sesja nie ma grup w bazie. Zapisywany na sesji snapshot konta, potem się nie zmienia.
 */
export type GroupAssignmentMode = 'manual' | 'ai';

/**
 * Czy nauczyciel ma podpisaną ze szkołą umowę powierzenia danych osobowych. 'private' oznacza,
 * że imiona i nazwiska uczniów nie mogą trafić do bazy nawet zaszyfrowane, więc jedynym
 * oznaczeniem pracy jest numer z dziennika. Deklaracja składana przy rejestracji.
 */
export type AccountKind = 'school' | 'private';

/**
 * Sposób oznaczania uczniów w danej klasie: 'named' to imię, nazwisko i numer (jak przed tą
 * zmianą), 'numbered' to tylko numer z dziennika. Tryb wynika z typu konta przy zakładaniu klasy
 * i już się nie zmienia — dlatego leży na klasie, a nie na koncie.
 */
export type RosterMode = 'named' | 'numbered';

export interface User {
  id: string;
  email: string;
  encryption_salt: string;
  pages_current_limit: number;
  pages_total_processed: number;
  // Login, GET /auth/me i PATCH /api/account oddają ten sam selekt (CLIENT_USER_SELECT), więc
  // żaden z tych endpointów nie może już zubożyć karty konta.
  display_name: string | null;
  default_grade_threshold_id: string | null;
  low_balance_alert_threshold: number;
  group_assignment_mode: GroupAssignmentMode;
  account_kind: AccountKind;
  subscription_tier: string;
  subscription_ends_at: string | null;
  email_verified_at: string | null;
  created_at: string;
  // Backend zawsze oddaje numer w masce (+48*******80); postać w clearze nie opuszcza bazy.
  phone: string | null;
  is_phone_verified: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
  turnstileToken?: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  phone: string;
  phoneConsent: boolean;
  /** Wybór z pierwszego bloku formularza. Backend nie ma tu wartości domyślnej — bez tego odrzuca rejestrację. */
  accountKind: AccountKind;
  /** Single-use token z widgetu Turnstile; bez niego backend odrzuca rejestrację. */
  turnstileToken?: string;
}

export interface RegisterResponse {
  message: string;
  email: string;
  phone: string;
  requires_phone_verification: boolean;
}

/**
 * Konfiguracja bramki antybotowej dla formularza rejestracji (GET /api/auth/captcha-config).
 * `sitekey` jest jawny i bez niego nie da się wyrenderować widgetu; secret key zostaje na serwerze.
 */
export interface CaptchaConfig {
  provider: 'turnstile';
  sitekey: string | null;
  required: boolean;
}

export interface SendSmsCodeResponse {
  message: string;
  expires_in_seconds: number;
  retry_after_seconds: number;
  phone: string;
}

export interface VerifySmsCodeResponse {
  message: string;
  user: User | null;
}

export interface ForgotPasswordRequest {
  email: string;
  turnstileToken?: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  message: string;
  encryption_salt: string;
}

// ============================================
// Account Settings — PATCH/DELETE /api/account (controllers/accountController.ts)
// ============================================

/** Pola nieobecne w żądaniu zostają nietknięte; null jawnie kasuje ustawienie. */
export interface AccountUpdateRequest {
  display_name?: string | null;
  default_grade_threshold_id?: string | null;
  low_balance_alert_threshold?: number;
  group_assignment_mode?: GroupAssignmentMode | null;
}

export interface AccountUpdateResponse {
  user: User;
}

// Typy dla klas i uczniów
export interface Class {
  id: string;
  user_id: string;
  encrypted_name: string;
  roster_mode: RosterMode;
  created_at: string;
  updated_at: string;
  students?: Student[];
  _count?: {
    students: number;
  };
}

// Request/Response types
export interface CreateClassRequest {
  encrypted_name: string;
  /**
   * Tylko dla konta prywatnego: liczba uczniów, których backend utworzy jako numery od 1 do N.
   * Przy koncie szkolnym pole nie pada — klasa z nazwiskami nie ma wspólnego licznika.
   */
  student_count?: number;
}

export interface Student {
  id: string;
  class_id: string;
  // W klasie numerowanej tych trzech pól nie ma — nie „nie udało się ich odszyfrować", tylko
  // nigdy ich nie było. null jest tu stanem normalnym, więc brak nazwiska nie może wyglądać
  // jak awaria klucza.
  encrypted_first_name: string | null;
  encrypted_last_name: string | null;
  encrypted_number: string | null;
  /** Numer z dziennika w klasie numerowanej; w klasie z nazwiskami zawsze null. */
  journal_number: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Formularz ucznia ma dwa kształty zależne od trybu klasy: trzy zaszyfrowane pola albo numer.
 * Unia, a nie obiekt z opcjonalnymi polami, bo klient, który wyśle jedno i drugie naraz, dostanie
 * od backendu 400 — w typie też nie ma prawa tego złożyć.
 */
export type CreateStudentRequest =
  | { encrypted_first_name: string; encrypted_last_name: string; encrypted_number: string }
  | { journal_number: number };

export type UpdateStudentRequest = Partial<CreateStudentRequest>;

/** Dokładanie uczniów do klasy numerowanej: numery startują za największym zajętym. */
export interface AppendStudentsRequest {
  student_count: number;
}

// ============================================
// Grading Session Types
// ============================================

export interface GradeEntry {
  grade: string;
  min_percent: number;
}

export interface GradeThreshold {
  id: string;
  user_id: string;
  name: string;
  thresholds: GradeEntry[];
  created_at: string;
  updated_at: string;
}

export interface AnswerKey {
  total_points: number;
  tasks: Array<{
    id: number;
    max_points: number;
    correct_answer: string;
    guidelines?: string;
    sub_items?: AnswerKeySubItem[];
  }>;
}

// ============================================
// Answer Key Library Types — kształty z controllers/answerKeyController.ts
// ============================================

/**
 * Podpunkt zadania (a, b, c…). Zadanie, które je ma, nie ma własnej punktacji do wpisania:
 * jego `max_points` to suma podpunktów, wyliczona po stronie serwera.
 */
export interface AnswerKeySubItem {
  id: string;
  max_points: number;
  correct_answer: string;
}

// Serwer normalizuje `id` zadania do tekstu, dlatego w bibliotece jest stringiem
export interface AnswerKeyTask {
  id: string;
  max_points: number;
  correct_answer: string;
  guidelines: string;
  sub_items?: AnswerKeySubItem[];
}

export interface AnswerKeyRecord {
  id: string;
  name: string;
  subject: string | null;
  // Zawsze wariant zerowy: kolumna answer_keys.tasks nie może być pusta, bo czytają ją odczyty
  // niemające pojęcia o wariantach (mianownik procentów, historia, sesja bez grup).
  tasks: AnswerKeyTask[];
  total_points: number;
  // Pusta tablica = klucz jednowariantowy, czyli dokładnie to, co było przed wariantami.
  groups: AnswerKeyGroupRecord[];
  created_at: string;
  updated_at: string;
}

/** Wariant zadań w kluczu odpowiedzi („Grupa A") — własne wiersze i własna suma punktów. */
export interface AnswerKeyGroupRecord {
  id: string;
  position: number;
  name: string;
  tasks: AnswerKeyTask[];
  total_points: number;
}

/** Skrót wariantu z listy biblioteki: bez treści zadań, tylko to, co widać na karcie. */
export interface AnswerKeySummaryGroup {
  id: string;
  position: number;
  name: string;
  total_points: number;
}

// Lista celowo nie taszcze treści zadań
export interface AnswerKeySummary {
  id: string;
  name: string;
  subject: string | null;
  tasks_count: number;
  total_points: number;
  sessions_count: number;
  groups: AnswerKeySummaryGroup[];
  groups_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Grupa = wariant arkusza (A, B, C) zamrożony na jednej sesji, nie na klasie.
 * Własny klucz odpowiedzi i własna lista uczniów; `student_ids` to same UUID, więc
 * zero-knowledge zostaje nienaruszone. Kolejność pokazywania wyznacza `position`.
 */
export interface GradingSessionGroup {
  id: string;
  session_id: string;
  position: number;
  name: string;
  answer_key: AnswerKey;
  answer_key_id: string | null;
  student_ids: string[];
  created_at: string;
  updated_at: string;
}

/** Skrót grup z GET /grading/sessions: tabela historii potrzebuje nazw i liczb, nie identyfikatorów uczniów */
export interface GradingSessionGroupBadge {
  id: string;
  name: string;
  position: number;
  students_count: number;
}

/**
 * Grupa tylko do wyświetlenia w kreatorze: nazwa i maksimum punktów wariantu z klucza odpowiedzi.
 * Przydział uczniów nie potrzebuje treści zadań, a sesja i tak dostanie snapshot po swojej stronie.
 */
export interface AnswerKeyGroupView {
  name: string;
  total_points: number;
}

/**
 * Grupa w żądaniu utworzenia sesji — tylko przydział uczniów. Klucz każdej grupy składamy po
 * stronie serwera z wariantu biblioteki o tej samej nazwie, więc klient nie może podsunąć
 * własnego klucza pod nazwę grupy.
 */
export interface CreateSessionGroupRequest {
  name: string;
  student_ids: string[];
}

/**
 * Grupa tylko do wyświetlenia: szkic z edytora grup i grupa wczytana z bazy mają wspólne
 * nazwa + członkowie, a klucz ani identyfikator nie są krokom po sesji do niczego potrzebne.
 * Kolejność tablicy wyznacza kolejność grup.
 */
export interface SessionGroupView {
  name: string;
  student_ids: string[];
}

export interface GradingSession {
  id: string;
  user_id: string;
  class_id: string;
  // Kopia nazwy klucza odpowiedzi z chwili tworzenia sesji; null dla kluczy wpisanych ręcznie
  name?: string | null;
  answer_key: AnswerKey;
  answer_key_id?: string | null;
  answer_key_ref?: { id: string; name: string } | null;
  // Pusta tablica (szczegóły sesji) albo null (lista sesji) = brak grup. `answer_key` wyżej to klucz
  // sesji: przy grupach jest to klucz pierwszej z nich, bo kolumna nie może być pusta — czyta ją
  // mianownik procentów i nazwa w historii. W trybie 'ai' to klucz wariantu zerowego.
  session_groups?: GradingSessionGroup[] | null;
  // Snapshot ustawienia konta z chwili utworzenia sesji. 'ai' = nikt nie przydzielał wariantów, tylko
  // model rozpoznał je z treści kartki; taka sesja NIE ma wierszy w `session_groups`, a jej skład to
  // klasa minus nieobecni.
  group_assignment_mode?: GroupAssignmentMode;
  // Warianty do rozpoznawania zamrożone na sesji w trybie 'ai' — treści z biblioteki z dnia utworzenia,
  // więc późniejsza edycja klucza nie zmienia już sprawdzonych prac.
  answer_key_variants?: SessionAnswerKeyVariant[] | null;
  grade_threshold_id?: string | null;
  grade_threshold?: GradeThreshold | null;
  // Uczniowie, którzy nie pisali sprawdzianu. Same UUID, więc zero-knowledge pozostaje nienaruszone
  absent_student_ids?: string[] | null;
  // awaiting_works = AI sprawdziło to, co wpłynęło, ale w klasie zostali uczniowie bez pracy i bez nieobecności
  status: 'in_progress' | 'processing' | 'completed' | 'awaiting_works' | 'archived';
  created_at: string;
  updated_at: string;
  grades?: Grade[];
  class?: Class;
}

/** Wariant arkusza zamrożony na sesji: własna migawka klucza, bez żadnego przydziału uczniów. */
export interface SessionAnswerKeyVariant {
  name: string;
  position: number;
  answer_key: AnswerKey;
}

export interface Grade {
  id: string;
  grading_session_id: string;
  student_id: string;
  image_path: string;
  ai_response: AIResponse;
  confidence_score: number;
  manually_verified: boolean;
  final_points: number | null;
  teacher_notes: string | null;
  // Poprawki nauczyciela trzymane osobno — ai_response zostaje śladem oryginalnej odpowiedzi AI
  teacher_response?: TeacherGradeResponse | null;
  model_used?: string | null;
  escalated?: boolean | null;
  // Który wariant trafił do tej pracy w sesji z rozpoznawaniem. `variant_source`: 'ai' = model rozpoznał
  // ze skanu, 'teacher' = nauczyciel wskazał, 'unresolved' = model już próbował i nie rozstrzygnął, więc
  // pracy nie pytamy ponownie przy każdym wejściu na wyniki. Null bez nazwy = wariant nierozstrzygnięty,
  // a rozpoznanie wciąż wolne: praca albo czeka na sprawdzanie sesji, albo samo wywołanie padło.
  // Taką pracę zostawiamy bez wyników i bez pobranej strony. W sesji z przydziałem ręcznym pola są puste,
  // bo wariant wynika z grupy.
  variant_name?: string | null;
  variant_confidence?: number | null;
  variant_source?: 'ai' | 'teacher' | 'unresolved' | null;
  /** Po co ten brak rozstrzygnięcia — zdanie z backendu dla nauczyciela, kasowane przy rozstrzygnięciu. */
  variant_note?: string | null;
  created_at: string;
  updated_at: string;
  student?: Student;
}

/** Lustrzane odbicie backendowej enumeracji z `aiGradingService`. */
export type TaskCertainty = 'certain' | 'key_ambiguous' | 'reading_uncertain' | 'missing_evidence';

export interface AIResponse {
  /** 0-100 wyliczone z etykiet zadań, ważone ich maksymalną punktacją. Model NIGDY nie podaje tej liczby. */
  confidence_score?: number;
  total_score?: number;
  tasks?: Array<{
    task_number: number;
    points: number;
    comment: string;
    /** Dosłownie to, co model odczytał z kartki. Puste = nie miał dowodu. */
    transcription?: string;
    certainty?: TaskCertainty;
    /** 0-100 tego jednego zadania, z jego etykiety. */
    confidence?: number;
    /**
     * Tylko dla zadań z podpunktami. Punkty, transkrypt i etykieta należą do podpunktu, a wiersz
     * zadania jest ich sumą — w ten sposób dwa poprawne z czterech nie mogą już dać czterech punktów.
     */
    sub_items?: Array<{
      id: string;
      points: number;
      max_points: number;
      transcription?: string;
      certainty?: TaskCertainty;
      confidence?: number;
    }>;
  }>;
}

export interface TeacherGradeResponse {
  total_score: number;
  tasks: Array<{
    task_number: number;
    points: number;
    comment: string;
    edited: boolean;
    /**
     * Podział wpisany przez nauczyciela per podpunkt; jego suma zawsze daje `points` tego wiersza.
     * Brak przy zadaniu z podpunktami oznacza poprawkę zbiorczą — wtedy nie ma już podziału, który
     * wolno by pokazać, bo wiersze AI nie sumują się do nowej liczby.
     */
    sub_items?: Array<{ id: string; points: number; max_points: number }>;
  }>;
}

// Wiersz tabeli historii — backend celowo nie zwraca tu treści klucza odpowiedzi
export interface GradingSessionSummary {
  id: string;
  name: string | null;
  created_at: string;
  updated_at: string;
  status: GradingSession['status'];
  class_id: string;
  encrypted_class_name: string | null;
  answer_key_name: string | null;
  answer_key_subject: string | null;
  threshold_name: string | null;
  // null dla sesji bez grupowania; przy grupach jedna pozycja na wariant arkusza
  session_groups: GradingSessionGroupBadge[] | null;
  works_count: number;
  // Nieobecni z listy sesji oraz uczniowie bez pracy i bez nieobecności — liczone po stronie bazy
  absent_count: number;
  missing_count: number;
  graded_count: number;
  avg_confidence: number;
  low_confidence_count: number;
  needs_verification: boolean;
  manually_verified_count: number;
  has_manual_edits: boolean;
}

/** Licznik postępu sprawdzania — karmi pasek w GradingResults bez przenoszenia ai_response */
export interface GradingSessionProgress {
  status: GradingSession['status'];
  total_count: number;
  processed_count: number;
}

// Request/Response types
export interface CreateGradingSessionRequest {
  class_id: string;
  answer_key?: AnswerKey;
  answer_key_id?: string | null;
  // Tablica grup w kolejności pokazywania; nazwy muszą odpowiadać wariantom wybranego klucza.
  // Z grupami answer_key_id jest obowiązkowe (to z biblioteki wynika klucz każdej grupy),
  // a sesja dziedziczy snapshot pierwszej z nich, bo jej kolumna nie może być pusta.
  // W koncie z trybem 'ai' tego pola się NIE wysyła — backend sam odmawia przydziału, bo wariant
  // pracy rozpoznaje model, a tryb czyta z konta, nie z żądania.
  groups?: CreateSessionGroupRequest[];
  grade_threshold_id?: string | null;
  absent_student_ids?: string[];
}

export interface UpdateGradeRequest {
  tasks?: Array<{
    task_number: number;
    // Obowiązkowe, gdy zadanie nie ma podpunktów. Przy podpunktach serwujemy wyłącznie `sub_items`,
    // a serwer sam sumuje punkty zadania — ta liczba jest wtedy pomijana.
    points?: number;
    comment?: string;
    // Poprawka per podpunkt. `id` to litera z klucza tej sesji; podpunkt spoza klucza dostaje 400.
    sub_items?: Array<{ id: string; points: number }>;
  }>;
  teacher_notes?: string | null;
  mark_verified?: boolean;
  // Wskazanie wariantu pracy w sesji z rozpoznawaniem. Wyklucza `tasks` w tym samym żądaniu:
  // wskazanie kasuje dotychczasowy wynik i liczy pracę od nowa z kluczem tego wariantu.
  variant_name?: string;
}

export interface CreateThresholdRequest {
  name: string;
  thresholds: GradeEntry[];
}

export interface UpdateThresholdRequest {
  name: string;
  thresholds: GradeEntry[];
}

/** Wiersz zadania w żądaniu zapisu klucza — `id` to numer porządkowy albo tekst. */
export interface AnswerKeyTaskInput {
  id: string | number;
  // Dla zadania z podpunktami serwer i tak liczy tę wartość z ich sumy.
  max_points: number;
  correct_answer: string;
  guidelines?: string;
  sub_items?: AnswerKeySubItem[];
}

export interface CreateAnswerKeyRequest {
  name: string;
  subject?: string | null;
  // Klucz jednowariantowy podaje płaskie `tasks`. Z `groups` te pola są liczone z wariantu
  // zerowego po stronie serwera, więc klient ich nie wysyła.
  tasks?: AnswerKeyTaskInput[];
  groups?: Array<{ name: string; tasks: AnswerKeyTaskInput[] }>;
}

export type UpdateAnswerKeyRequest = CreateAnswerKeyRequest;

export interface UploadImageRequest {
  student_id: string;
  session_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  image: File;
}

// ============================================
// Wallet Types — kształty odpowiedzi z backendu (controllers/walletController.ts)
// ============================================

export interface PagePack {
  id: string;
  pages: number;
  /** Cena brutto w zł (z VAT). */
  priceGrossPln: number;
  name: string;
  tagline: string;
  features: string[];
  badge?: 'recommended' | 'best_value';
}

export interface MonthlyPlan {
  id: string;
  /** Strony przydzielane na każdy okres rozliczeniowy. */
  pagesPerPeriod: number;
  /** Cena brutto w zł (z VAT) za miesiąc. */
  priceGrossPln: number;
  name: string;
  tagline: string;
  features: string[];
  badge?: 'recommended' | 'best_value';
}

export interface WalletResponse {
  pages_balance: number;
  pages_used_total: number;
  currency: string;
  payments_enabled: boolean;
  packs: PagePack[];
  plans: MonthlyPlan[];
}
