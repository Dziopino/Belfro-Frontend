import { useEffect, useState, type ReactNode } from 'react';
import { Check, CreditCard, RefreshCw, Wallet, Zap } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import HeaderAccount from '../components/HeaderAccount';
import LowBalanceNotice from '../components/LowBalanceNotice';
import { useAuth } from '../contexts/AuthContext';
import { walletAPI } from '../services/apiService';
import { pluralPolish } from '../utils/polish';
import type { MonthlyPlan, PagePack, WalletResponse } from '../types';
import { apiErrorMessage } from '../utils/apiError';

const moneyFormatter = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function pagesWord(count: number): string {
  return pluralPolish(count, 'strona', 'strony', 'stron');
}

/** 25 to typowa liczba prac w klasie na jednym sprawdzianie. */
function approxTests(balance: number): number {
  return Math.floor(balance / 25);
}

const BADGE_LABELS = {
  recommended: 'Najczęściej wybierany',
  best_value: 'Najniższa cena za stronę',
} as const;

/**
 * Obie rodziny ofert mają identyczny układ karty, więc sprowadzamy je do jednego shape'u.
 * Różnią się tylko tym, czy pula wraca co miesiąc, czy zostaje na zawsze.
 */
interface Offer {
  id: string;
  name: string;
  tagline: string;
  priceGrossPln: number;
  pages: number;
  features: string[];
  badge?: 'recommended' | 'best_value';
  recurring: boolean;
}

function offerFromPack(pack: PagePack): Offer {
  return {
    id: pack.id,
    name: pack.name,
    tagline: pack.tagline,
    priceGrossPln: pack.priceGrossPln,
    pages: pack.pages,
    features: pack.features,
    badge: pack.badge,
    recurring: false,
  };
}

function offerFromPlan(plan: MonthlyPlan): Offer {
  return {
    id: plan.id,
    name: plan.name,
    tagline: plan.tagline,
    priceGrossPln: plan.priceGrossPln,
    pages: plan.pagesPerPeriod,
    features: plan.features,
    badge: plan.badge,
    recurring: true,
  };
}

function OfferCard({ offer, paymentsEnabled }: { offer: Offer; paymentsEnabled: boolean }) {
  const highlighted = offer.badge === 'recommended';

  return (
    <article
      className={`relative flex flex-col bg-[#131B2E] border rounded-2xl p-4 sm:p-5 ${
        highlighted ? 'border-blue-500 ring-1 ring-blue-500/30' : 'border-slate-800/60'
      }`}
    >
      {offer.badge && (
        <span
          className={`absolute -top-3 left-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
            highlighted
              ? 'bg-blue-950/60 border-blue-500/50 text-blue-300'
              : 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
          }`}
        >
          {offer.badge === 'best_value' && <Zap className="w-3.5 h-3.5" aria-hidden="true" />}
          {BADGE_LABELS[offer.badge]}
        </span>
      )}

      <h3 className="mt-2 text-lg font-bold text-slate-100">{offer.name}</h3>
      <p className="text-xs text-slate-400 mt-1 min-h-8">{offer.tagline}</p>

      <p className="mt-4 text-2xl sm:text-3xl font-bold text-slate-100 tabular-nums">
        {moneyFormatter.format(offer.priceGrossPln)}
        {offer.recurring && <span className="text-sm sm:text-base font-medium text-slate-400"> / mies.</span>}
      </p>
      <p className="text-xs text-slate-400 mt-1 tabular-nums">
        {offer.pages.toLocaleString('pl-PL')} {pagesWord(offer.pages)}
        {offer.recurring ? ' każdego miesiąca' : ''} ·{' '}
        {moneyFormatter.format(offer.priceGrossPln / offer.pages)} za stronę
      </p>

      <ul className="mt-4 space-y-2 flex-1">
        {offer.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-slate-300">
            <Check className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={!paymentsEnabled}
        title={
          paymentsEnabled
            ? offer.recurring
              ? `Włącz abonament: ${offer.pages} ${pagesWord(offer.pages)} każdego miesiąca`
              : `Doładuj konto o ${offer.pages} ${pagesWord(offer.pages)}`
            : 'Płatności uruchomimy w kolejnym kroku'
        }
        className={`mt-5 inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl font-medium transition-colors min-h-11 ${
          paymentsEnabled
            ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
            : 'bg-slate-800/50 text-slate-400 border border-slate-700 cursor-not-allowed'
        }`}
      >
        {offer.recurring ? (
          <RefreshCw className="w-5 h-5" aria-hidden="true" />
        ) : (
          <CreditCard className="w-5 h-5" aria-hidden="true" />
        )}
        {offer.recurring ? 'Włącz abonament' : 'Doładuj'}
      </button>
    </article>
  );
}

function OfferGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-96 bg-[#131B2E] border border-slate-800/60 rounded-2xl animate-pulse motion-reduce:animate-none"
          aria-busy="true"
        >
          <p className="sr-only">Ładowanie oferty</p>
        </div>
      ))}
    </div>
  );
}

export default function WalletPage() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadWallet = async () => {
    setIsLoading(true);
    setError('');
    try {
      setWallet(await walletAPI.getWallet());
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Nie udało się pobrać cennika'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWallet();
  }, []);

  const balance = wallet?.pages_balance ?? user?.pages_current_limit ?? 0;

  return (
    <div className="flex min-h-screen bg-[#0B0F19]">
      <Sidebar />

      <div className="flex-1 w-full min-w-0 lg:ml-64">
        {/* Header */}
        <header className="h-14 sm:h-16 bg-[#131B2E] border-b border-slate-800/60 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-10">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="lg:hidden flex items-center gap-3 pl-12">
              <div className="font-bold text-slate-100 text-sm leading-none">BELFRO.PL</div>
            </div>
          </div>

          <HeaderAccount pagesLeft={balance} />
        </header>

        <main id="main-content" tabIndex={-1} className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 mx-auto w-full max-w-6xl">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Doładuj konto</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Abonament miesięczny wychodzi taniej za stronę, a doładowanie jednorazowe nie ma daty
              ważności — wybierz to, co pasuje do Twojego roku szkolnego
            </p>
          </div>

          {error && (
            <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-4" role="alert">
              <p className="text-sm text-rose-400">{error}</p>
              <button
                onClick={loadWallet}
                className="mt-3 px-4 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-sm font-medium transition-colors cursor-pointer min-h-11"
              >
                Spróbuj ponownie
              </button>
            </div>
          )}

          {/* Saldo */}
          <section className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm text-slate-400">Saldo stron</p>
                {isLoading ? (
                  <div
                    className="mt-2 h-9 w-40 bg-slate-800/60 rounded-lg animate-pulse motion-reduce:animate-none"
                    aria-busy="true"
                  >
                    <p className="sr-only">Ładowanie salda</p>
                  </div>
                ) : (
                  <p className="mt-1 text-3xl sm:text-4xl font-bold text-slate-100 tabular-nums">
                    {balance}{' '}
                    <span className="text-lg sm:text-xl font-semibold text-slate-400">{pagesWord(balance)}</span>
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-2 tabular-nums">
                  Sprawdzone łącznie:{' '}
                  {wallet?.pages_used_total ?? user?.pages_total_processed ?? 0}{' '}
                  {pagesWord(wallet?.pages_used_total ?? 0)}
                </p>
              </div>

              <div className="flex items-center gap-3 px-4 py-3 bg-slate-800/40 border border-slate-700/60 rounded-xl">
                <Wallet className="w-6 h-6 text-emerald-400 shrink-0" aria-hidden="true" />
                <p className="text-xs text-slate-300 leading-relaxed max-w-[28ch]">
                  Wystarczy na około {approxTests(balance)}{' '}
                  {pluralPolish(approxTests(balance), 'sprawdzian', 'sprawdziany', 'sprawdzianów')} 25-osobowej
                  klasy
                </p>
              </div>
            </div>
          </section>

          <LowBalanceNotice />

          {wallet && !wallet.payments_enabled && (
            <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl p-4" role="status">
              <p className="text-sm text-blue-300">
                Płatności online właśnie uruchamiamy. Cennik jest już gotowy — doładowanie i abonament
                odblokujemy w kolejnym kroku.
              </p>
            </div>
          )}

          {/* Abonament miesięczny */}
          <section className="space-y-4">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-100">Abonament miesięczny</h2>
              <p className="text-xs text-slate-400 mt-1">
                Najniższa cena za stronę. Pula odnawia się z każdym miesiącem, a niewykorzystane strony
                przepadają — rezygnacja w każdej chwili.
              </p>
            </div>

            {isLoading ? (
              <SkeletonGrid />
            ) : (
              wallet && (
                <OfferGrid>
                  {wallet.plans.map((plan) => (
                    <OfferCard
                      key={plan.id}
                      offer={offerFromPlan(plan)}
                      paymentsEnabled={wallet.payments_enabled}
                    />
                  ))}
                </OfferGrid>
              )
            )}
          </section>

          {/* Doładowanie jednorazowe */}
          <section className="space-y-4">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-100">Doładowanie jednorazowe</h2>
              <p className="text-xs text-slate-400 mt-1">
                Drożej za stronę, ale strony nie mają daty ważności — zostają na koncie, dopóki ich nie
                zużyjesz.
              </p>
            </div>

            {isLoading ? (
              <SkeletonGrid />
            ) : (
              wallet && (
                <OfferGrid>
                  {wallet.packs.map((pack) => (
                    <OfferCard
                      key={pack.id}
                      offer={offerFromPack(pack)}
                      paymentsEnabled={wallet.payments_enabled}
                    />
                  ))}
                </OfferGrid>
              )
            )}
          </section>

          {/* Jak liczymy strony */}
          <section className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6">
            <h2 className="text-lg font-bold text-slate-100">Co to jest jedna strona</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>
                  Jedna strona to jedna kartka pracy jednego ucznia wysłana do sprawdzenia. Klasa 25 osób na
                  jednej kartce to 25 stron.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>
                  Gdy AI nie jest pewne wyniku, praca trafia do dokładniejszego modelu. Nie liczymy za to
                  osobno — to nadal jedna i ta sama strona w tej samej cenie.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>
                  W abonamencie miesięcznym niewykorzystane strony przepadają z końcem okresu. Z doładowania
                  jednorazowego nie przepadają nigdy.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>
                  Klas, uczniów, kluczy odpowiedzi i progów ocen nie limitujemy — płacisz tylko za strony do
                  sprawdzenia.
                </span>
              </li>
            </ul>
          </section>
        </main>
      </div>
    </div>
  );
}
