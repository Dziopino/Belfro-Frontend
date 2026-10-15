# Frontend Belfero

React 19 + Vite 8 (rolldown) + Tailwind 3.4. Ciemny motyw jest jedynym wariantem — nie ma przełącznika
ani jasnej wersji. Domyślnie `:5173`, API pod `VITE_API_URL`.

## Skrypty

| polecenie | co robi |
|---|---|
| `npm run dev` | serwer deweloperski Vite |
| `npm run build` | `tsc -b` → `vite build` → `node scripts/gen-sitemap.mjs` |
| `npm run preview` | podgląd tego, co leży w `dist/` |
| `npm run lint` | `oxlint`, konfiguracja w `.oxlintrc.json` |
| `npm run check:seo` | bramka metadanych, tytułów, nagłówków i plików publicznych |
| `npm run check:a11y` | bramka dostępności |
| `npm run check:perf` | bramka budżetu pakietu startowego |
| `npm run check` | wszystkie trzy bramki po kolei |
| `npm run brand:assets` | odtwarza znaki firmowe z rastrowego źródła |

## Zmienne środowiskowe (`frontend/.env`)

| nazwa | gdzie | po co |
|---|---|---|
| `VITE_API_URL` | `src/services/apiService.ts:39` oraz `index.html` (przedłącze `preconnect`) | pełny adres API, na przykład `http://localhost:3000/api`; gdy jest nieustawiony, aplikacja wraca do domyślnego adresu lokalnego z `apiService.ts:39` |
| `VITE_SITE_URL` | `scripts/gen-sitemap.mjs` | domena dla `sitemap.xml`; bez niej build pomija sitemap i drukuje powód |

Poza tym w kodzie bywa `import.meta.env.DEV`: steruje asercjami budującymi PDF
(`src/utils/sessionPdf.ts:60`) i szczegółami wyjątku w `ErrorBoundary.tsx:50`. W wariancie
produkcyjnym obu rzeczy po prostu nie ma.

## Jak to jest zbudowane

- **Widoki doczytywane trasą.** Siedemnaście stron za `lazy()` (`src/App.tsx:17-33`), a granica
  `<Suspense fallback={<RouteFallback />}>` siedzi **wewnątrz** `ErrorBoundary` (`:41-42`), więc chunk,
  którego nie da się dociągnąć po redeployu, wpada w czytną ścieżkę zamiast bielić ekran. Shell
  aplikacji (auth, sidebar, metadane trasy, fokus) zostaje w pakiecie startowym.
- **Groupy vendorów** w `vite.config.ts:19-44`: `react-vendor`, `router`, `http`, `icons`. Ich celem
  nie jest rozmiar pierwszego ładowania, tylko stabilność hashów — edycja jednego widoku nie powinna
  unieważniać około 330 kB kodu, którego nauczyciel i tak nie zmienił.
- **Kryptografia E2E w przeglądarce** (`src/services/cryptoService.ts`): klucz jest wyprowadzany z
  hasła nauczyciela przez `crypto.subtle.deriveKey` (PBKDF2) i żyje wyłącznie w RAM. Stąd dwa twarde
  ograniczenia: aplikacja wymaga bezpiecznego kontekstu (https albo `localhost`), a po odświeżeniu
  strony klucz przepada, dopóki nauczyciel się nie przeloguje.
- **Nazwy własne to dane osobowe, ale nie każde konto je ma.** Imiona, nazwiska i nazwy klas leżą w
  bazie zaszyfrowane, a ich deszyfracja dzieje się w widokach. Dlatego tam, gdzie może nie być klucza,
  zobaczysz `—`, a nie puste pole ani surowy base64. Na koncie nauczyciela prywatnego (`account_kind =
  'private'`) nazwisk w bazie nie ma wcale — uczniem jest numer z dziennika, a klasa zakłada się z
  licznika.
- **Jedno miejsce, które mówi, jak wygląda uczeń** (`src/utils/studentIdentity.ts`): `studentIdentity()`
  (`:46`) zwraca `label` („Jan Kowalski" albo „Nr 12"), `number`, `numbered` i `decrypt_failed`.
  Istnieje, bo deszyfracja była rozpisana po pięciu widokach i każdy dorabiał własny znak braku.
  Rozróżnienie jest istotne: `null` w kolumnie szyfrowanej znaczy „tu nic nie leży" (lista numerowa), a
  nie „awaria klucza" — stąd `decryptOrEmpty()` (`:32`) i osobny `decrypt_failed` (`:21-22`). Nie
  rozpoznawaj trybu listy po treści wiersza; `numbered` płynie z `class.roster_mode`
  (`types/index.ts:136`). Tam, gdzie potrzebna jest tylko etykieta bez deszyfracji, jest
  `studentFallbackLabel()` (`:83`).
- **Jedno miejsce tłumaczenia błędów** (`src/utils/apiError.ts`): backend oddaje `{ error, code }`,
  a UI pokazuje zdanie dobrane po `code`. Surowego `error` nie widać nigdy — to tekst dla
  programisty, często z nazwą zmiennej w środku. Nowy kod z backendu bez wpisu w rejestrze dostaje
  tylko polski ogólnik, więc dopisuj go od razu; liczby w zdaniach (limity, progi) przepisuj ze
  stałych backendu, nie z pamięci.
- **PDF po stronie klienta** (`src/utils/sessionPdf.ts`, `src/utils/pdfFonts.ts`): osadzone fonty
  DejaVu są konieczne, bo bez nich jsPDF gubi polskie diakrytyki. Chunk z fontami, `jsPDF` i
  `html2canvas` schodzą dopiero przy eksporcie, nie przy starcie aplikacji.
- **Style bazowe w `src/index.css`** niosą cztery rzeczy pilnowane przez bramki: ten sam `#0B0F19` co
  `theme-color` w `index.html`, wspólny wskaźnik fokusu, zapora `prefers-reduced-motion` oraz kursor
  steru na każdym klikalnym elemencie, także mobilnym.

## Kreator sprawdzania prac

Sześć kroków pod jedną trasą (`src/pages/GradingQueuePage.tsx:40-47`): klucz odpowiedzi → progi ocen →
obecność → przydział grup → kolejka → wyniki. Kolejność nie jest kosmetyczna — na przydziale widać tylko
tych, którzy dziś piszą (`:37-39`), a punkty i procenty liczą się z klucza zamrożonego przy tworzeniu sesji.

- **Wznowienie z historii nie ufa stanowi klienta.** `loadExistingSession` (`:130`) zasila `submittedIds`
  (`:77`) z `fetched.grades`, a `persistAndAdvance` (`:242`) wylicza kolejkę z listy klasy minus ci, którzy
  już mają pracę (`:254-259`). Skład grup czytany jest z wierszy sesji (`:166-171`), nigdy z bieżącego
  przydziału w klasie — sesja mrozi skład, tak jak mrozi nazwę i treść klucza.
- **Kolejka liczy prace, nie uczniów.** `handledIds` (`src/components/GradingQueue.tsx:91`) — wysłane i
  pominięte — wypada z `pendingStudents` (`:95`), a więc i z `visibleStudents` (`:100`). Chip grupy pokazuje
  liczbę prac, które w niej zostały, na tle jej liczności (`:126`), i znika, gdy zostaje zero, więc grupy,
  z którą skończyliśmy, nie da się kliknąć od nowa.
- **Indeksu w kolejce nie przestawiamy.** `goToNext` (`:160`) nie inkrementuje pozycji: obsłużona praca
  wypada z listy, więc jej następca wchodzi pod ten sam indeks. Przesunięcie o jeden pomijałoby ucznia.
- **Koniec filtrowanej grupy to nie koniec sesji.** O panelu „grupa sprawdzona" decyduje
  `remainingOutsideFilter` (`:109`), nie `remainingWorks` (`:117`) — ten drugi liczy stan renderu, który
  jeszcze nie zaksięgował właśnie wysłanej pracy, więc przy ostatniej pracy w grupie myli się o jedną.
- **Pasek filtrów żyje, dopóki jest co wybierać.** `selectableOptions` (`:364`) dolicza uczniów bez
  przydziału (dopisanych do klasy po utworzeniu sesji) jako trzecią opcję. Bez tego „Wszystkie grupy"
  zniknęłoby razem z ostatnią grupą, a to jedyne wejście na tych uczniów.
- **Klucz, maksimum punktów i etykieta grupy resolveują się w jednym pliku** (`src/utils/grading.ts`):
  `answerKeyForStudent:189`, `maxPointsForStudent:202`, `groupNameForStudent:210`, a dla już ocenionej pracy
  `answerKeyForGrade:267` i `variantLabelForGrade:287`. `studentsWithoutGroup:225` wyłapuje tych poza
  przydziałem, `variantAwaitingChoice:310` te, których wariant czeka na kliknięcie nauczyciela. Widoki nie
  mogą dorabiać własnego „który to klucz".
- **Dwa progi pewności to nie to samo.** `LOW_CONFIDENCE_THRESHOLD = 70` (`src/utils/grading.ts:12`) steruje
  tylko tym, co UI wyróżnia jako „Wymaga weryfikacji" (karta pracy, tabela wyników, PDF). Eskalacja do
  droższego modelu dzieje się po stronie backendu przy 75 (`backend/src/services/aiGradingService.ts:185`) i
  nie ma tu czego ruszać z frontendu.
- **Ceny istnieją wyłącznie na backendzie.** `WalletPage` czyta jedno `walletAPI.getWallet()`
  (`src/pages/WalletPage.tsx:175`, klient w `src/services/apiService.ts:508`) i renderuje to, co przyszło z
  `GET /api/wallet`. Żadna stawka nie może trafić do kodu UI — jedynym ich miejscem jest
  `backend/src/config/pricing.ts`.
- **Znana blokada: wiele plików to w bazie jedna strona.** Input przyjmuje `multiple`
  (`src/components/GradingQueue.tsx:634`) i pętla wysyła każdy plik osobno (`:286-301`), a
  `grades.image_path` jest jednym `String` (`backend/prisma/schema.prisma:354`), więc każdy kolejny
  wysłany plik zastępuje poprzedni i kasuje go z dysku. Z pracy dwustronicowej AI ocenia ostatnią
  stronę, a napis w interfejsie („Możesz wybrać wiele plików naraz", `:628`) obiecuje coś innego.

## Pliki publiczne i bramy

`public/` to `favicon.svg`, `og.png`, `robots.txt`, `llms.txt`, `humans.txt` i `site.webmanifest`.
`llms.txt` oraz `humans.txt` istnieją dla botów i agentów czytających serwis — to nie kosmetyka,
pilnuje ich `check:seo`.

Trzy bramki są skryptami Node bez dodatkowych zależności (`scripts/check-*.mjs`). Dwie pierwsze
 czytają źródła, trzecia dokłada artefakty z `dist/`; bez `dist/` grupa artefaktów drukuje `POM`,
żeby nie fałszować wyniku czerwonym błędem.

## Czego tu nie robić

- Nie przeklikiwać ścieżek logowania, rejestracji i odzyskiwania hasła na żywej bazie: hasło jest
  materiałem klucza E2E, a reset hasła unieważnia dane wszystkich uczniów konta.
- Nie odpalać oceny sesji (`POST /api/grading/sessions/:id/process`) z ciekawości — to prawdziwe
  pieniądze i prawdziwe tokeny.
- Nie dorabiać imienia i nazwiska w klasie numerowanej — ani pola w formularzu, ani deszyfracji „na
  wszelki wypadek", ani drugiej kolumny w wydruku. Ten tryb istnieje właśnie po to, żeby u nauczyciela
  bez umowy ze szkołą nazwiska nie było skąd wziąć.
- Nie zamieniać `—` i `…` na znaki ASCII i nie psuć odmiany liczebników („2 zdjęcia", a nie „2 zdjęć");
  formy liczy `src/utils/polish.ts` i to jest traktowane jak błąd funkcjonalny, nie kosmetyka.
- Nie obawiać się `crypto.randomUUID()` w kodzie: bezpieczny kontekst jest i tak wymuszony przez
  `crypto.subtle`, więc ten warunek obowiązuje od pierwszego dnia projektu.
- Nie skracać kolejki z powrotem do całej listy klasy i nie inkrementować indeksu w `goToNext`. Bez filtru
  `handledIds` nauczyciel, który skończy grupę A, wchodzi do niej od nowa od zera, a każde ponowne wysłanie
  zastępuje stary skan (`backend/src/controllers/gradingController.ts:1304-1339`) i kasuje go z dysku;
  punkty w tabeli zostają ze starej wersji. Backend przed tym nie broni — bramą jest wyłącznie ten filtr.
