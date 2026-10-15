import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ExternalLink } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import HeaderAccount from '../components/HeaderAccount';
import { useAuth } from '../contexts/AuthContext';
import { accountAPI, authAPI, classesAPI, thresholdsAPI } from '../services/apiService';
import { pluralPolish } from '../utils/polish';
import { apiErrorMessage } from '../utils/apiError';
import type { AccountUpdateRequest, GradeThreshold, GroupAssignmentMode } from '../types';

const INPUT_CLASS =
  'w-full px-4 py-2.5 bg-[#1A2338] border border-slate-800 text-slate-100 placeholder-slate-400 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors';

const DISPLAY_NAME_MAX_LENGTH = 60;

// Tryb „ai" działa od kreatora po wydruk: sesja w nim powstaje bez przydziału, a wariant rozpoznaje
// model. Opis musi to oddawać, bo nauczyciel po zmianie ustawienia nie zobaczy już ekranu grup.
const GROUP_MODE_OPTIONS: Array<{
  value: GroupAssignmentMode;
  label: string;
  description: string;
}> = [
  {
    value: 'manual',
    label: 'Przypisuję grupy sam',
    description:
      'Na kroku „Przypisanie grup” wskażesz, kto pisze wariant A, B czy C. Klasę możesz też rozdać losowo albo przepisać podział z ostatniej sesji.',
  },
  {
    value: 'ai',
    label: 'AI rozpoznaje wariant ze skanu',
    description:
      'Krok „Przypisanie grup” znika: AI dostaje wszystkie warianty klucza i z treści kartki poznaje, który wariant napisał uczeń. Samego rozpoznania nie liczymy jako strony. Gdy model nie będzie pewny, praca zostaje nieoceniona i bez pobranej strony — wskażesz jej wariant w karcie pracy, a sprawdzimy ją od nowa.',
  },
];

function pagesWord(count: number): string {
  return pluralPolish(count, 'strona', 'strony', 'stron');
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pl-PL');
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6">
      <h2 className="text-lg font-bold text-slate-100">{title}</h2>
      {description && <p className="text-sm text-slate-400 mt-1 leading-relaxed">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatusBadge({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
        ok
          ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
          : 'bg-amber-950/40 border-amber-800/50 text-amber-300'
      }`}
    >
      {ok && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
      {ok ? yes : no}
    </span>
  );
}

function InfoRow({
  label,
  value,
  children,
}: {
  label: string;
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-slate-800/60 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm text-slate-200 mt-0.5 break-words">{value}</p>
      </div>
      {children && <div className="flex items-center gap-2 shrink-0 ml-auto">{children}</div>}
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [defaultThresholdId, setDefaultThresholdId] = useState('');
  const [lowBalanceInput, setLowBalanceInput] = useState('50');
  const [groupAssignmentMode, setGroupAssignmentMode] = useState<GroupAssignmentMode>('manual');

  const [thresholds, setThresholds] = useState<GradeThreshold[]>([]);
  const [classCount, setClassCount] = useState<number | null>(null);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [areListsLoading, setAreListsLoading] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedField, setSavedField] = useState<string | null>(null);

  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [emailResent, setEmailResent] = useState(false);

  // Uzupełniamy raz, przy wejściu na konto. Późniejsze refreshUser() po zapisie nie może
  // nadpisywać tego, co nauczyciel właśnie wpisuje w polach.
  useEffect(() => {
    if (!user) return;
    setDisplayName(user.display_name ?? '');
    setDefaultThresholdId(user.default_grade_threshold_id ?? '');
    setLowBalanceInput(String(user.low_balance_alert_threshold ?? 50));
    setGroupAssignmentMode(user.group_assignment_mode ?? 'manual');
  }, [user?.id]);

  useEffect(() => {
    let isCancelled = false;

    const loadLists = async () => {
      try {
        const [{ thresholds: fetched }, { classes }] = await Promise.all([
          thresholdsAPI.getThresholds(),
          classesAPI.getClasses(),
        ]);

        if (isCancelled) return;

        setThresholds(fetched);
        setClassCount(classes.length);
        setStudentCount(classes.reduce((total, item) => total + (item._count?.students ?? 0), 0));
      } catch (err: any) {
        if (!isCancelled) {
          setError(apiErrorMessage(err, 'Nie udało się pobrać skal ocen i listy klas'));
        }
      } finally {
        if (!isCancelled) setAreListsLoading(false);
      }
    };

    loadLists();

    return () => {
      isCancelled = true;
    };
  }, []);

  const balance = user?.pages_current_limit ?? 0;
  const totalProcessed = user?.pages_total_processed ?? 0;
  const emailVerified = Boolean(user?.email_verified_at);
  const phoneVerified = Boolean(user?.is_phone_verified);

  const patchAccount = async (data: AccountUpdateRequest, fieldKey: string): Promise<boolean> => {
    setError('');
    setSavedField(null);
    setIsSaving(true);

    try {
      await accountAPI.updateAccount(data);
      await refreshUser();
      setSavedField(fieldKey);
      return true;
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się zapisać zmian'));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const saveDisplayName = async () => {
    const trimmed = displayName.trim();
    // Puste pole to świadomy powrót do adresu email w nagłówku, więc wysyłamy null, nie ''.
    await patchAccount({ display_name: trimmed.length > 0 ? trimmed : null }, 'display_name');
  };

  const saveDefaultThreshold = async () => {
    await patchAccount(
      { default_grade_threshold_id: defaultThresholdId.length > 0 ? defaultThresholdId : null },
      'default_threshold'
    );
  };

  const saveLowBalance = async () => {
    const parsed = Number(lowBalanceInput);

    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100000) {
      setError('Próg musi być liczbą całkowitą od 0 do 100 000.');
      return;
    }

    await patchAccount({ low_balance_alert_threshold: parsed }, 'low_balance');
  };

  const saveGroupAssignmentMode = async () => {
    await patchAccount({ group_assignment_mode: groupAssignmentMode }, 'group_assignment_mode');
  };

  const resendVerificationEmail = async () => {
    if (!user?.email) return;

    setError('');
    setEmailResent(false);
    setIsResendingEmail(true);

    try {
      await authAPI.resendVerification({ email: user.email });
      setEmailResent(true);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się wysłać linku potwierdzającego'));
    } finally {
      setIsResendingEmail(false);
    }
  };

  const isDisplayNameDirty = displayName.trim() !== (user?.display_name ?? '');
  const isThresholdDirty = defaultThresholdId !== (user?.default_grade_threshold_id ?? '');
  const lowBalanceParsed = Number(lowBalanceInput);
  const isLowBalanceDirty =
    Number.isInteger(lowBalanceParsed) && lowBalanceParsed !== (user?.low_balance_alert_threshold ?? 50);
  const isGroupModeDirty = groupAssignmentMode !== (user?.group_assignment_mode ?? 'manual');

  return (
    <div className="flex min-h-screen bg-[#0B0F19]">
      <Sidebar />

      <div className="flex-1 w-full min-w-0 lg:ml-64">
        <header className="h-14 sm:h-16 bg-[#131B2E] border-b border-slate-800/60 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-10">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="lg:hidden flex items-center gap-3 pl-12">
              <div className="font-bold text-slate-100 text-sm leading-none">BELFRO.PL</div>
            </div>
          </div>

          <HeaderAccount pagesLeft={balance} />
        </header>

        <main id="main-content" tabIndex={-1} className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-5 mx-auto w-full max-w-4xl">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Ustawienia konta</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Swoje dane, domyślne wybory w kreatorze sprawdzania i dostęp do konta
            </p>
          </div>

          {error && (
            <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-4" role="alert">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}

          <SettingsCard
            title="Profil nauczyciela"
            description="Imię i nazwisko pokazujemy w nagłówku aplikacji zamiast adresu email. Nazwy klas i dane uczniów zostają zaszyfrowane — to pole ich nie odsłania."
          >
            <label htmlFor="display-name" className="block text-sm font-medium text-slate-300 mb-2">
              Imię i nazwisko
            </label>
            <input
              id="display-name"
              type="text"
              value={displayName}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="np. Anna Kowalska"
              className={INPUT_CLASS}
            />
            <p className="text-xs text-slate-400 mt-2">
              Zostaw puste, żeby w nagłówku wrócił adres email.
            </p>

            <div className="mt-4 flex items-center justify-end gap-3">
              {savedField === 'display_name' && !isDisplayNameDirty && (
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
                  <Check className="w-4 h-4" aria-hidden="true" />
                  Zapisano
                </span>
              )}
              <button
                type="button"
                onClick={saveDisplayName}
                disabled={!isDisplayNameDirty || isSaving}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors text-sm cursor-pointer min-h-11 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Zapisz
              </button>
            </div>
          </SettingsCard>

          <SettingsCard
            title="Domyślne progi ocen"
            description="Kreator sprawdzania sam zaznaczy tę skalę na kroku „Progi ocen”. Wybór w danej sesji i tak możesz zmienić — to tylko oszczędność kliknięcia."
          >
            <label htmlFor="default-threshold" className="block text-sm font-medium text-slate-300 mb-2">
              Skala używana domyślnie
            </label>
            <select
              id="default-threshold"
              value={defaultThresholdId}
              onChange={(event) => setDefaultThresholdId(event.target.value)}
              disabled={areListsLoading}
              className={`${INPUT_CLASS} cursor-pointer disabled:cursor-not-allowed`}
            >
              <option value="">Bez progów ocen — tylko punkty</option>
              {thresholds.map((threshold) => (
                <option key={threshold.id} value={threshold.id}>
                  {threshold.name}
                </option>
              ))}
            </select>

            {!areListsLoading && thresholds.length === 0 && (
              <button
                type="button"
                onClick={() => navigate('/grade-thresholds')}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
              >
                Nie masz jeszcze żadnej skali — utwórz ją tutaj
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
              </button>
            )}

            <div className="mt-4 flex items-center justify-end gap-3">
              {savedField === 'default_threshold' && !isThresholdDirty && (
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
                  <Check className="w-4 h-4" aria-hidden="true" />
                  Zapisano
                </span>
              )}
              <button
                type="button"
                onClick={saveDefaultThreshold}
                disabled={!isThresholdDirty || isSaving || areListsLoading}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors text-sm cursor-pointer min-h-11 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Zapisz
              </button>
            </div>
          </SettingsCard>

          <SettingsCard
            title="Przypisanie uczniów do grup"
            description="Dotyczy sprawdzianu, którego klucz ma kilka wariantów (Grupa A, B, C). Tryb zapisuje się na sesji w chwili jej utworzenia, więc późniejsza zmiana tutaj nie dotyczy już rozpoczętych sprawdzianów. Klucz z jednym wariantem zawsze idzie na przydział ręczny — nie ma czego rozpoznawać."
          >
            <div className="space-y-3">
              {GROUP_MODE_OPTIONS.map((option) => {
                const isSelected = groupAssignmentMode === option.value;

                return (
                  <label
                    key={option.value}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#1A2338] border-blue-500'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="group-assignment-mode"
                      value={option.value}
                      checked={isSelected}
                      onChange={() => setGroupAssignmentMode(option.value)}
                      className="mt-0.5 w-5 h-5 shrink-0 cursor-pointer accent-blue-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm sm:text-base font-medium text-slate-100">{option.label}</span>
                      <span className="block text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              {savedField === 'group_assignment_mode' && !isGroupModeDirty && (
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
                  <Check className="w-4 h-4" aria-hidden="true" />
                  Zapisano
                </span>
              )}
              <button
                type="button"
                onClick={saveGroupAssignmentMode}
                disabled={!isGroupModeDirty || isSaving}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors text-sm cursor-pointer min-h-11 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Zapisz
              </button>
            </div>
          </SettingsCard>

          <SettingsCard
            title="Przypomnienie o saldzie"
            description="Gdy saldo spadnie poniżej tej liczby stron, pokażemy przypomnienie na pulpicie i w portfelu. 0 wyłącza przypomnienia."
          >
            <label htmlFor="low-balance" className="block text-sm font-medium text-slate-300 mb-2">
              Przypominaj poniżej
            </label>
            <input
              id="low-balance"
              type="number"
              min={0}
              max={100000}
              step={10}
              value={lowBalanceInput}
              onChange={(event) => setLowBalanceInput(event.target.value)}
              className={`${INPUT_CLASS} tabular-nums`}
            />
            <p className="text-xs text-slate-400 mt-2 tabular-nums">
              Teraz masz {balance} {pagesWord(balance)} w zapasie.
            </p>

            <div className="mt-4 flex items-center justify-end gap-3">
              {savedField === 'low_balance' && !isLowBalanceDirty && (
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
                  <Check className="w-4 h-4" aria-hidden="true" />
                  Zapisano
                </span>
              )}
              <button
                type="button"
                onClick={saveLowBalance}
                disabled={!isLowBalanceDirty || isSaving}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors text-sm cursor-pointer min-h-11 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Zapisz
              </button>
            </div>
          </SettingsCard>

          <SettingsCard title="Dane kontaktowe">
            <InfoRow
              label="Adres email"
              value={
                <span className="flex flex-wrap items-center gap-2">
                  {user?.email}
                  <StatusBadge ok={emailVerified} yes="Potwierdzony" no="Niepotwierdzony" />
                </span>
              }
            >
              {!emailVerified && (
                <button
                  type="button"
                  onClick={resendVerificationEmail}
                  disabled={isResendingEmail}
                  className="px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium rounded-xl transition-colors text-sm cursor-pointer min-h-11 disabled:opacity-50"
                >
                  {isResendingEmail ? 'Wysyłanie…' : 'Wyślij link ponownie'}
                </button>
              )}
            </InfoRow>

            {emailResent && (
              <div className="mt-3 bg-blue-950/40 border border-blue-800/50 rounded-xl p-3" role="status">
                <p className="text-sm text-blue-300">
                  Link potwierdzający poszedł na {user?.email}. Sprawdź też foldery Spam i Oferty.
                </p>
              </div>
            )}

            <InfoRow
              label="Numer telefonu"
              value={
                <span className="flex flex-wrap items-center gap-2 tabular-nums">
                  {user?.phone ?? 'Brak numeru — napisz do nas, żeby go dopisać'}
                  <StatusBadge ok={phoneVerified} yes="Potwierdzony" no="Niepotwierdzony" />
                </span>
              }
            >
              {!phoneVerified && (
                <button
                  type="button"
                  onClick={() => navigate('/verify-phone')}
                  className="px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium rounded-xl transition-colors text-sm cursor-pointer min-h-11"
                >
                  Potwierdź numer
                </button>
              )}
            </InfoRow>

            <InfoRow label="Konto założone" value={<time dateTime={user?.created_at}>{formatDate(user?.created_at)}</time>} />
          </SettingsCard>

          <SettingsCard
            title="Hasło i szyfrowanie"
            description="Zmiana hasła nie jest dostępna w ustawieniach — i to nie przez niedopatrzenie."
          >
            <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl p-4">
              <p className="text-sm text-blue-300 leading-relaxed">
                Nazwy klas oraz imiona, nazwiska i numery uczniów z dziennika są szyfrowane kluczem
                utworzonym z Twojego hasła. Zmiana hasła sprawia, że te zapisy przestają być czytelne,
                więc rozważ ją dopiero na koncie bez klas. Jeśli musisz zmienić hasło, skorzystaj z linku
                „Nie pamiętam hasła” na ekranie logowania.
              </p>
            </div>
          </SettingsCard>

          <SettingsCard title="Twój dorobek">
            <InfoRow
              label="Klasy"
              value={
                classCount === null
                  ? '—'
                  : `${classCount} ${pluralPolish(classCount, 'klasa', 'klasy', 'klas')}`
              }
            />
            <InfoRow
              label="Uczniowie"
              value={
                studentCount === null
                  ? '—'
                  : `${studentCount} ${pluralPolish(studentCount, 'uczeń', 'uczniów', 'uczniów')}`
              }
            >
              <button
                type="button"
                onClick={() => navigate('/classes')}
                className="px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium rounded-xl transition-colors text-sm cursor-pointer min-h-11"
              >
                Moje klasy
              </button>
            </InfoRow>
            <InfoRow label="Sprawdzone strony" value={`${totalProcessed} ${pagesWord(totalProcessed)}`}>
              <button
                type="button"
                onClick={() => navigate('/wallet')}
                className="px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium rounded-xl transition-colors text-sm cursor-pointer min-h-11"
              >
                Doładuj konto
              </button>
            </InfoRow>
          </SettingsCard>
        </main>
      </div>
    </div>
  );
}
