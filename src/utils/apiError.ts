import { pluralPolish } from './polish';

/**
 * Jedno miejsce, w którym angielszczyzna z backendu zamienia się w zdanie dla nauczyciela.
 *
 * Układ jest taki: backend mówi po angielsku i do każdego payloadu błędu dokłada stabilny `code`
 * (od 2026-10-19 — wszystkie 202 payloady, wcześniej kod miało 89; liczby z `backend/tmp/code-coverage.mjs`),
 * a tutaj tłumaczymy po kodzie. Surowego `error` nie pokazujemy NIGDY, bo to tekst dla
 * programisty: „Internal server error”,
 * „absent_student_ids must be an array” albo zdanie z podstawioną nazwą zmiennej. Ten sam powód,
 * dla którego siedem mapek z stron i komponentów (`AUTH_ERROR_MESSAGES`, `ACCOUNT_ERROR_MESSAGES`,
 * `UPLOAD_ERROR_MESSAGES`, `ANSWER_KEY_ERROR_MESSAGES`, `THRESHOLD_ERROR_MESSAGES`,
 * `HISTORY_ERROR_MESSAGES`, `CLASS_ERROR_MESSAGES`) trafiło tu zamiast zostać w swoich plikach:
 * wiele źródeł prawdy oznaczało kod tłumaczony raz i nietłumaczony drugi raz, a ostatnia z nich
 * dopasowywała tłumaczenie po angielskim zdaniu, więc każdy nowszy tekst API szedł wprost do
 * nauczyciela.
 */

interface ApiErrorPayload {
  error?: unknown;
  code?: unknown;
  current_limit?: unknown;
  required_pages?: unknown;
}

const API_ERROR_MESSAGES: Record<string, string> = {
  // ---- Logowanie, rejestracja, weryfikacja konta -------------------------------------------
  // Celowo bez wskazywania, co jest nie tak: backend nie różni nieznanego adresu od złego hasła.
  INVALID_CREDENTIALS: 'Nie udało się zalogować. Sprawdź adres email i hasło.',
  CREDENTIALS_REQUIRED: 'Podaj adres email i hasło.',
  EMAIL_REQUIRED: 'Podaj adres email.',
  EMAIL_INVALID: 'To nie wygląda na poprawny adres email.',
  EMAIL_TAKEN: 'Konto z tym adresem email już istnieje. Zaloguj się albo użyj „Nie pamiętam hasła”.',
  PASSWORD_TOO_SHORT: 'Hasło musi mieć co najmniej 8 znaków.',
  ACCOUNT_KIND_INVALID: 'Wybierz, czy konto zakłada nauczyciel prywatny, czy szkoła.',
  TOKEN_INVALID: 'Ta sesja wygasła. Zaloguj się ponownie.',
  TOKEN_MISSING: 'Brak danych logowania. Zaloguj się ponownie.',
  TOKEN_REQUIRED: 'W żądaniu brakuje tokenu. Zaloguj się ponownie.',
  UNAUTHORIZED: 'Twoja sesja wygasła. Zaloguj się ponownie.',
  EMAIL_NOT_VERIFIED:
    'Konto wymaga potwierdzenia adresu email. Kliknij link z wiadomości, którą do Ciebie wysłaliśmy.',
  VERIFICATION_LINK_RESENT:
    'Konto z tym adresem czeka jeszcze na potwierdzenie. Wysłaliśmy nowy link.',
  VERIFICATION_EMAIL_FAILED:
    'Konto utworzone, ale nie udało się wysłać wiadomości potwierdzającej. Spróbuj za chwilę.',
  VERIFICATION_TOKEN_INVALID: 'Ten link potwierdzający wygasł albo został już użyty. Poproś o nowy.',

  // ---- Bramka SMS -------------------------------------------------------------------------
  PHONE_REQUIRED: 'Podaj numer telefonu, żeby założyć konto.',
  PHONE_INVALID: 'To nie wygląda na polski numer komórkowy. Użyj formatu +48 600 700 800.',
  PHONE_TAKEN: 'Ten numer telefonu jest już powiązany z innym kontem w Belfero.',
  CONSENT_REQUIRED: 'Zgoda na przetwarzanie numeru telefonu jest wymagana, aby utworzyć konto.',
  PHONE_MISSING: 'Do tego konta nie jest przypisany żaden numer telefonu. Napisz do nas, żeby go dopisać.',
  EMAIL_OR_PHONE_NOT_VERIFIED:
    'Konto wymaga potwierdzenia adresu email i numeru telefonu. Dokończ weryfikację, żeby sprawdzać prace.',
  SMS_COOLDOWN_ACTIVE: 'Kod poszedł przed chwilą. Poproś o kolejny za minutę.',
  SMS_CODE_MISSING: 'Brak aktywnego kodu. Poproś o nowy kod SMS.',
  SMS_CODE_EXPIRED: 'Ten kod wygasł. Poproś o nowy i wpisz go w ciągu 5 minut.',
  SMS_CODE_INVALID: 'Kod jest nieprawidłowy. Sprawdź cyfry i spróbuj ponownie.',
  SMS_ATTEMPTS_EXCEEDED: 'Za wiele błędnych prób, więc kod przestał działać. Poproś o nowy.',
  SMS_SEND_FAILED: 'Nie udało się wysłać kodu SMS. Spróbuj ponownie za chwilę.',

  // ---- Bramka antybotowa -------------------------------------------------------------------
  // Te kody wracają z rejestracji, logowania i prośby o link do resetu hasła, więc komunikat nie
  // może obiecywać żadnej z tych trzech czynności.
  CAPTCHA_REQUIRED: 'Zaznacz, że nie jesteś robotem, żeby kontynuować.',
  CAPTCHA_FAILED: 'Potwierdzenie, że nie jesteś robotem, wygasło. Zaznacz checkbox jeszcze raz.',
  CAPTCHA_UNAVAILABLE:
    'Nie udało się połączyć z weryfikacją przeciw robotom. Spróbuj ponownie za chwilę — formularz bez tej bramki nie przejdzie.',

  // ---- Reset hasła ------------------------------------------------------------------------
  RESET_FIELDS_REQUIRED: 'Uzupełnij token i nowe hasło.',
  RESET_TOKEN_INVALID: 'Ten link do resetu hasła wygasł albo został już użyty. Poproś o nowy link.',

  // ---- Klasy i uczniowie ------------------------------------------------------------------
  CLASS_NAME_REQUIRED: 'Nazwa klasy jest wymagana.',
  CLASS_ID_REQUIRED: 'Brak identyfikatora klasy. Odśwież stronę i spróbuj ponownie.',
  CLASS_NOT_FOUND: 'Ta klasa nie istnieje albo należy do innego konta. Odśwież listę klas.',
  STUDENT_FIELDS_REQUIRED: 'Uzupełnij imię, nazwisko i numer ucznia.',
  // Górna granica liczby uczniów to `MAX_ROSTER_SIZE` (`backend/src/utils/roster.ts:19`).
  STUDENT_COUNT_INVALID: 'Podaj liczbę uczniów — całą liczbę od 1 do 100.',
  // Klasa prowadzona bez nazwisk: tam uczniem jest numer z dziennika, a nie imię i nazwisko.
  STUDENT_NUMBER_REQUIRED: 'Ten uczeń jest oznaczony numerem z dziennika — podaj ten numer.',
  STUDENT_NUMBER_TAKEN: 'Ten numer ucznia jest już zajęty w tej klasie. Użyj następnego wolnego.',
  STUDENT_NAMED_FIELDS_FORBIDDEN:
    'Ta klasa jest prowadzona bez nazwisk, więc imienia i nazwiska nie da się w niej zapisać.',
  STUDENT_APPEND_NOT_NUMBERED: 'Hurtem da się dokładać uczniów tylko do klas prowadzonych bez nazwisk.',
  STUDENT_NOT_FOUND: 'Ten uczeń nie istnieje. Odśwież listę uczniów.',
  USER_NOT_FOUND: 'Nie znaleźliśmy Twojego konta. Zaloguj się ponownie.',

  // ---- Progi ocen -------------------------------------------------------------------------
  THRESHOLD_NAME_INVALID: 'Nazwa skali musi mieć od 1 do 60 znaków.',
  THRESHOLD_ENTRIES_INVALID:
    'Skala musi mieć od 2 do 6 progów, a każdy próg nazwę od 1 do 8 znaków.',
  THRESHOLD_PERCENT_OUT_OF_RANGE: 'Każdy próg musi być liczbą całkowitą od 0 do 100 procent.',
  THRESHOLD_DUPLICATE_ENTRY: 'Nie można powtarzać tej samej oceny ani tego samego progu procentowego.',
  THRESHOLD_NOT_FOUND: 'Ta skala już nie istnieje. Odśwież stronę i wybierz inną.',
  THRESHOLD_NOT_OWNED: 'Ta skala należy do innego konta.',

  // ---- Klucze odpowiedzi ------------------------------------------------------------------
  // Liczby poniżej są przepisane ze stałych backendu: `NAME_MAX_LENGTH`, `SUBJECT_MAX_LENGTH`,
  // `TASKS_MAX_COUNT`, `MAX_POINTS_LIMIT`, `SUB_ITEMS_MAX_COUNT`, `GROUPS_MAX_COUNT`,
  // `GROUP_NAME_MAX_LENGTH` (answerKeyController.ts:44-64). Zmiana limitu bez tej zmiany oznacza
  // nauczyciela proszonego o coś, czego walidacja i tak nie przyjmie.
  ANSWER_KEY_REQUIRED: 'Wybierz klucz odpowiedzi, żeby sprawdzić prace.',
  ANSWER_KEY_NOT_FOUND: 'Ten klucz nie istnieje albo został usunięty. Odśwież listę kluczy.',
  ANSWER_KEY_NOT_OWNED: 'Ten klucz nie należy do Twojego konta.',
  ANSWER_KEY_NAME_REQUIRED: 'Podaj nazwę klucza (do 100 znaków), a przedmiot do 60 znaków',
  ANSWER_KEY_TASKS_REQUIRED: 'Klucz musi zawierać co najmniej jedno zadanie',
  ANSWER_KEY_TASK_INVALID:
    'Każde zadanie musi mieć numer i dodatnią liczbę punktów, a numery nie mogą się powtarzać',
  ANSWER_KEY_SUB_ITEM_INVALID:
    'Każdy podpunkt musi mieć literę, dodatnią punktację i poprawną odpowiedź (najwyżej 20 podpunktów)',
  ANSWER_KEY_SUB_ITEM_ID_DUPLICATED: 'Podpunkty w jednym zadaniu muszą mieć różne litery',
  ANSWER_KEY_POINTS_MISMATCH: 'Suma punktów nie zgadza się z zadaniami',
  ANSWER_KEY_GROUPS_REQUIRED: 'Ten klucz ma grupy — zapisz wszystkie warianty naraz',
  ANSWER_KEY_HAS_NO_GROUPS: 'Ten klucz nie ma grup. Dodaj warianty w edytorze klucza.',
  ANSWER_KEY_GROUPS_INVALID:
    'Każda grupa musi mieć nazwę i co najmniej jedno zadanie (najwyżej 8 grup)',
  ANSWER_KEY_GROUP_NAME_INVALID: 'Nazwa grupy musi mieć od 1 do 30 znaków',
  ANSWER_KEY_GROUP_NAME_DUPLICATED: 'Grupy w kluczu muszą mieć różne nazwy',

  // ---- Sesje sprawdzania ------------------------------------------------------------------
  SESSION_NOT_FOUND: 'Ta sesja sprawdzania nie istnieje. Wróć do historii.',
  SESSION_PROCESSING: 'Ta sesja jest właśnie sprawdzana przez AI. Poczekaj do końca.',
  SESSION_ALREADY_PROCESSING:
    'Sprawdzanie tej sesji już ruszyło. Nie wysyłaj drugiego żądania — nic nie zostanie policzone podwójnie.',
  ABSENT_STUDENTS_INVALID: 'Lista nieobecnych jest niekompletna. Odśwież stronę i oznacz jeszcze raz.',
  ABSENT_STUDENTS_TOO_MANY: 'W jednej sesji możesz oznaczyć najwyżej 200 nieobecnych.',
  ABSENT_STUDENT_NOT_IN_CLASS: 'Uczeń oznaczony jako nieobecny nie należy do tej klasy.',
  SESSION_PATCH_EMPTY:
    'Nie ma czego zapisać — brak listy nieobecnych i przydziału grup. Odśwież stronę i spróbuj ponownie.',
  FILE_MISSING: 'Nie dotarł żaden plik ze skanem. Wybierz zdjęcie jeszcze raz.',
  // Odrzucenie na samym wgraniu, zanim cokolwiek policzy kontroler (`middleware/errorHandler.ts`).
  // Limit 10 MB to `MAX_SCAN_BYTES` (`backend/src/config/upload.ts:12`).
  UPLOAD_FILE_TYPE_INVALID: 'Załączony plik nie jest zdjęciem. Obsługujemy JPEG, PNG i HEIC.',
  UPLOAD_FILE_TOO_LARGE: 'Skan jest za duży. Jeden plik może mieć najwyżej 10 MB.',
  UPLOAD_FIELD_UNEXPECTED: 'Skan nie dotarł w oczekiwanym polu formularza. Wybierz plik jeszcze raz.',
  UPLOAD_REJECTED: 'Nie udało się przyjąć pliku. Wybierz zdjęcie jeszcze raz.',
  RECT_FIELDS_MISSING: 'Brak współrzędnych zaznaczenia. Zaznacz imię i nazwisko jeszcze raz.',
  RECT_INVALID: 'Zaznaczenie ma nieprawidłowe współrzędne. Zaznacz imię i nazwisko jeszcze raz.',
  RECT_OUTSIDE_IMAGE: 'Zaznaczony obszar wykracza poza zdjęcie. Zaznacz imię i nazwisko jeszcze raz.',
  RECT_COVERS_PAGE: 'Zaznaczony obszar zajmuje prawie całą kartkę. Zamaluj tylko imię i nazwisko.',
  UNREADABLE_IMAGE: 'Nie udało się odczytać zdjęcia. Spróbuj innego pliku.',

  // ---- Grupy i warianty -------------------------------------------------------------------
  // Liczby z `SESSION_GROUPS_MAX_COUNT`, `GROUP_NAME_MAX_LENGTH`, `GROUP_STUDENTS_MAX_COUNT`
  // (gradingController.ts:133-135).
  GROUPS_INVALID: 'Przypisanie grup jest niekompletne. Uzupełnij listę i spróbuj ponownie.',
  GROUPS_LIMIT_EXCEEDED: 'Sesja może mieć najwyżej 8 grup.',
  GROUPS_REQUIRE_LIBRARY_KEY:
    'Grupy definiuje się w kluczu odpowiedzi — wybierz klucz z biblioteki, nie ten wpisany przy sesji.',
  GROUP_NAME_INVALID: 'Nazwa grupy musi mieć od 1 do 30 znaków.',
  GROUP_NAME_DUPLICATED: 'Dwie grupy w sesji mają tę samą nazwę.',
  GROUP_VARIANT_NOT_FOUND: 'Ta grupa nie pasuje do żadnego wariantu w wybranym kluczu.',
  GROUP_STUDENTS_TOO_MANY: 'Do jednej grupy możesz przypisać najwyżej 200 uczniów.',
  GROUP_STUDENT_DUPLICATED: 'Uczeń może być przypisany tylko do jednej grupy.',
  GROUP_STUDENT_NOT_IN_CLASS: 'Przypisany uczeń nie należy do tej klasy.',
  // Przydział w już zapisanej sesji — `parseSessionGroupsPatch` (gradingController.ts:432).
  SESSION_HAS_NO_GROUPS: 'Ta sesja nie ma grup, więc nie ma do czego przypisywać uczniów.',
  SESSION_GROUPS_MISMATCH:
    'Przypisanie nie pasuje do grup tej sesji. Odśwież stronę i sprawdź przydział we wszystkich grupach.',
  GROUP_STUDENT_HAS_WORK:
    'Ten uczeń ma już policzone punkty — nie można go przenieść do innej grupy, bo jego wynik liczono z dotychczasowego wariantu.',
  GROUP_STUDENT_HAS_SCAN: 'Ten uczeń ma dodaną pracę, więc musi zostać w którejś grupie.',
  GROUPS_NOT_ALLOWED_WITH_VARIANT_DETECTION:
    'Ta sesja rozpoznaje warianty ze skanu, więc nie ma w niej przydziału grup.',
  VARIANTS_NOT_FROZEN:
    'Ta sesja ma rozpoznawać warianty, ale nie ma zamrożonych wariantów. Dokończ jej setup.',
  VARIANT_DETECTION_DISABLED:
    'Ta sesja bierze wariant z przydziału grup, nie z rozpoznania. Wybierz wariant przy uczniu.',
  VARIANT_NOT_AVAILABLE: 'Ten wariant nie istnieje w tej sesji.',
  VARIANT_GRADE_FAILED:
    'Wariant zapisany, ale praca nie została oceniona. Wznów sprawdzanie tej sesji.',

  // ---- Poprawki nauczyciela w punktach ----------------------------------------------------
  // Liczby z `GRADE_TASKS_MAX_COUNT`, `GRADE_COMMENT_MAX_LENGTH` (gradingController.ts:1540-1541).
  GRADE_NOT_FOUND: 'Ta praca nie istnieje. Odśwież stronę sesji.',
  GRADE_TASKS_TOO_MANY: 'Poprawka może dotyczyć najwyżej 200 zadań naraz.',
  GRADE_TASK_INVALID: 'Każde poprawione zadanie musi być pełnym wpisem z numerem i punktami.',
  GRADE_TASK_UNKNOWN: 'To zadanie nie istnieje w kluczu tej sesji.',
  GRADE_POINTS_INVALID: 'Punkty muszą mieścić się od zera do maksimum tego zadania.',
  GRADE_COMMENT_INVALID: 'Komentarz do zadania może mieć najwyżej 2000 znaków.',
  GRADE_SUB_ITEMS_INVALID: 'Podpunkty muszą być pełną listą dla tego zadania.',
  GRADE_SUB_ITEMS_NOT_ALLOWED:
    'To zadanie nie ma podpunktów w kluczu tej sesji, więc punkty wpisuje się zbiorczo.',
  GRADE_SUB_ITEM_UNKNOWN: 'Ten podpunkt nie należy do tego zadania w kluczu tej sesji.',
  GRADE_SUB_ITEM_DUPLICATED: 'Ten podpunkt jest poprawiony dwa razy w jednym zadaniu.',
  GRADE_SUB_ITEM_POINTS_INVALID: 'Punkty podpunktu muszą mieścić się od zera do jego maksimum.',
  GRADE_NOTES_INVALID: 'Notatka dla nauczyciela musi być tekstem albo zostać usunięta.',
  GRADE_VARIANT_UNRESOLVED:
    'Najpierw wskaż wariant arkusza tej pracy, potem poprawiaj punkty.',
  GRADE_VARIANT_WITH_TASKS:
    'Wybierz albo wariant, albo poprawione punkty — nie obu naraz.',

  // ---- Konto, saldo, limity ---------------------------------------------------------------
  DISPLAY_NAME_INVALID: 'Imię i nazwisko może mieć najwyżej 60 znaków.',
  GROUP_ASSIGNMENT_MODE_INVALID: 'Tryb przydziału grup to albo „ręcznie”, albo „AI”.',
  LOW_BALANCE_THRESHOLD_INVALID: 'Próg musi być liczbą całkowitą od 0 do 100 000.',
  PAGE_LIMIT_EXCEEDED: 'Na koncie brakuje stron, żeby sprawdzić tę sesję. Doładuj konto.',

  // ---- Błędy usługi -----------------------------------------------------------------------
  INTERNAL_ERROR: 'Serwer Belfero nie mógł wykonać tej czynności. Spróbuj za chwilę.',
  ROUTE_NOT_FOUND: 'Serwer nie zna tego adresu. Odśwież stronę.',
};

/** Zdanie na wypadek kodu, którego tu nie ma — wciąż polskie, wciąż bez angielszczyzny z API. */
function statusSentence(status: number | undefined): string | undefined {
  if (status === undefined) return undefined;
  if (status === 401) return 'Twoja sesja wygasła. Zaloguj się ponownie.';
  if (status === 403) return 'Nie masz uprawnień do tej czynności.';
  if (status === 404) return 'Nie znaleźliśmy tego, o co prosi strona. Odśwież ją.';
  if (status === 409) return 'Ktoś inny zmienił to w międzyczasie. Odśwież stronę i spróbuj ponownie.';
  if (status === 413) return 'Ten plik jest za duży, żeby go przesłać.';
  if (status === 429) return 'Za dużo prób pod rząd. Odczekaj chwilę i spróbuj ponownie.';
  if (status >= 500) return 'Serwer Belfero nie odpowiada. Spróbuj za chwilę.';
  return undefined;
}

/**
 * Kod błędu z payloada API. Eksportowane, bo strony potrzebują go do decyzji, nie do napisu:
 * np. odmowa captcha nie może pokazać tego samego zdania co złe hasło.
 */
export function apiErrorCode(error: unknown): string | undefined {
  const payload = (error as { response?: { data?: ApiErrorPayload } } | undefined)?.response?.data;
  return typeof payload?.code === 'string' ? payload.code : undefined;
}

/**
 * Czy błąd w ogóle przyszedł z serwera. Bez odpowiedzi to rozłączona sieć albo backend, który
 * nie wstał — i to trzeba powiedzieć osobno, bo reszta zdań („odśwież stronę”) byłaby wtedy
 * rada bez pokrycia.
 */
export function isNetworkError(error: unknown): boolean {
  return !(error as { response?: unknown } | undefined)?.response;
}

/**
 * Tłumaczenie samego kodu, bez warstwy statusu i sieci. Potrzebne tam, gdzie błąd mógł powstać
 * lokalnie: `cryptoService` rzuca polski `Error` bez `response`, a dla niego warstwa sieciowa
 * poniżej powiedziałby „sprawdź internet”, choć winny jest klucz szyfrujący.
 */
export function apiCodeMessage(code: string | undefined, error: unknown): string | undefined {
  if (!code) return undefined;
  if (code === 'PAGE_LIMIT_EXCEEDED') return pageLimitSentence(error);
  return API_ERROR_MESSAGES[code];
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  const code = apiErrorCode(error);
  const translated = apiCodeMessage(code, error);
  if (translated) return translated;

  if (isNetworkError(error)) {
    return 'Nie udało się połączyć z serwerem Belfero. Sprawdź internet i spróbuj ponownie.';
  }

  const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
  return statusSentence(status) ?? fallback;
}

function pageLimitSentence(error: unknown): string {
  const payload = (error as { response?: { data?: ApiErrorPayload } } | undefined)?.response?.data;
  const required = toFiniteNumber(payload?.required_pages);
  const available = toFiniteNumber(payload?.current_limit);

  if (required === undefined || available === undefined) return API_ERROR_MESSAGES.PAGE_LIMIT_EXCEEDED;

  return `Do sprawdzenia jest ${required} ${pluralPolish(required, 'strona', 'strony', 'stron')}, ` +
    `a na koncie zostało ${available} ${pluralPolish(available, 'strona', 'strony', 'stron')}. Doładuj konto.`;
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Tekst do `console.error`, nigdy na ekran: kod, status i angielskie zdanie z API. Zachowanie to
 * samo co wcześniej, tylko wypchnięte z widoku nauczyciela — bez niego zgłoszenie „nie działa”
 * nie ma czym prześledzić.
 */
export function apiErrorDetails(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: ApiErrorPayload } } | undefined)
    ?.response;
  const code = apiErrorCode(error) ?? 'BEZ KODU';
  const status = response?.status ?? 'brak odpowiedzi';
  const raw = typeof response?.data?.error === 'string' ? response.data.error : '';
  return `code=${code} status=${status}${raw ? ` api="${raw}"` : ''}`;
}
