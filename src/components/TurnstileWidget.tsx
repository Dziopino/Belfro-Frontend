import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Widget Cloudflare Turnstile.
 *
 * Token jest single-use: po odrzuconej rejestracji (np. zajęty numer) trzeba wywołać `reset()`,
 * bo druga próba na tym samym tokenu dostałaby `timeout-or-duplicate` od Cloudflare. Dlatego
 * komponent wystawia reset przez ref, a nie tylko callback z tokenem.
 */

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  /** Cloudflare podaje tu kod błędu (np. `600010`) — bez niego awarii nie da się zdiagnozować. */
  'error-callback'?: (errorCode?: string) => void;
  theme?: 'auto' | 'light' | 'dark';
  size?: 'normal' | 'flexible' | 'compact';
  appearance?: 'always' | 'interaction-only' | 'execute';
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let apiPromise: Promise<TurnstileApi> | null = null;

/**
 * Referencja do WŁASNEGO wstrzykniętego `<script>`. Bez niej retry nie miało jak zadziałać:
 * `load` i `error` strzelają raz w życiu elementu, więc po awarii moduł zerował `apiPromise`,
 * ale w DOM nadal wisiał stary znacznik — następne mountowanie wchodziło w gałąź „skrypt już
 * jest" i tylko pollowało na obiekt, który nigdy nie nadchodził.
 */
let injectedScript: HTMLScriptElement | null = null;

const TURNSTILE_POLL_MS = 50;
const TURNSTILE_POLL_LIMIT = 60;

/**
 * Trzy stany awarii, które wcześniej wyglądały jak jeden. Rodzic formularza potrzebuje ich,
 * żeby przestać czekać na token, który przy tej przyczynie nigdy nie padnie.
 * - `blocked` — skrypt nie ruszył (adblock, DNS, offline);
 * - `unavailable` — skrypt wczytany, ale nie wystawił `window.turnstile`;
 * - `rejected` — Cloudflare odrzucił render (np. sitekey bez tego hostnameu) albo sam challenge.
 */
export type TurnstileFailure = 'blocked' | 'unavailable' | 'rejected';

/**
 * Stan całego widżetu dla rodzica. `'ready'` jest równie ważne jak awaria: bez niego formularz
 * zapamiętałby pierwszą odmowę na zawsze i przestał czekać na token po udanej ponownej próbie.
 */
export type TurnstileStatus = 'ready' | TurnstileFailure;

type LoadFailure = Error & { failure?: TurnstileFailure };

function detachScript(): void {
  injectedScript?.remove();
  injectedScript = null;
}

/**
 * Jeden skrypt na aplikację, nie na mount. Dwie rzeczy, które wcześniej się tu nie zgadzały:
 * - skrypt wpięty przez poprzedni mount nigdy nie powtórzy zdarzenia `load`, więc przy przejściu
 *   z jednej strony z captcha na drugą starszy kod czekał na wydarzenie, które nie nadejdzie;
 * - odrzucony promise jest nieodwracalny, więc trzeba go wyczyścić razem z elementem, inaczej
 *   „Spróbuj ponownie" oddawałby ten sam błąd do czasu przeładowania strony.
 * Polling `window.turnstile` to siatka bezpieczeństwa na wolne łącze, nie ścieżka domyślna:
 * przy normalnym wejściu obiekt jest gotowy w sekundę zdarzenia `load`.
 */
function loadTurnstileApi(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<TurnstileApi>((resolve, reject) => {
    // Oczekiwany stan użytkownika, nie wyjątek programistyczny: adblock i odrzucony hostname
    // zdarzają się każdego dnia, więc nie podnosimy tego do `console.error`.
    const fail = (reason: string, failure: TurnstileFailure) => {
      apiPromise = null;
      detachScript();
      console.warn(`[Turnstile] ${failure}: ${reason}`);
      reject(Object.assign(new Error(reason), { failure }) as LoadFailure);
    };

    const waitForObject = () => {
      let attempts = 0;

      const tick = () => {
        if (window.turnstile) {
          resolve(window.turnstile);
          return;
        }
        if (++attempts >= TURNSTILE_POLL_LIMIT) {
          fail('Skrypt wczytany, ale nie wystawił okna turnstile', 'unavailable');
          return;
        }
        window.setTimeout(tick, TURNSTILE_POLL_MS);
      };

      tick();
    };

    if (injectedScript?.isConnected) {
      // Skrypt w drodze albo już wykonany przez wcześniejszy mount: `load` nie strzeli ponownie,
      // więc pytamy wprost o obiekt. Polling trafia obie sytuacje.
      waitForObject();
      return;
    }

    const script = document.createElement('script');
    injectedScript = script;
    script.addEventListener('load', waitForObject);
    script.addEventListener('error', () => fail('Nie udało się wczytać skryptu Turnstile', 'blocked'));
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });

  return apiPromise;
}

export interface TurnstileWidgetHandle {
  /** Unieważnia zużyty token i prosi o nowy. */
  reset: () => void;
}

interface TurnstileWidgetProps {
  sitekey: string;
  onToken: (token: string) => void;
  onExpire: () => void;
  /**
   * Wywołane przy każdej ZMIANIE stanu widżetu: przy awarii i przy udanym renderze ('ready').
   * Rodzic logowania czeka na token w ukrytym widżecie, więc bez tej informacji klika i wisi,
   * a potem wysyła formularz, który musi dostać `CAPTCHA_REQUIRED`.
   */
  onStatus?: (status: TurnstileStatus) => void;
  /**
   * Dozwolone wartości to dokładnie te, które akceptuje Cloudflare: 'always' to widoczna ramka
   * (domyślność Cloudflare, na niej stoi rejestracja i prośba o link), 'interaction-only' nie
   * pokazuje niczego, dopóki challenge nie zażąda interakcji — tego używa logowanie.
   * Brak wartości = nie wysyłamy parametru w ogóle.
   */
  appearance?: 'always' | 'interaction-only' | 'execute';
  hint?: string;
}

const DEFAULT_HINT = 'Zaznacz pole poniżej, żeby potwierdzić, że konto zakładasz Ty, a nie program.';

const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ sitekey, onToken, onExpire, onStatus, appearance, hint = DEFAULT_HINT }, ref) {
    const container = useRef<HTMLDivElement | null>(null);
    const widgetId = useRef<string | null>(null);
    const [failure, setFailure] = useState<TurnstileFailure | null>(null);
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const [retryKey, setRetryKey] = useState(0);

    // Callbacky idą do rodzica, a rodzic zmienia się przy każdym renderze — ref pozwala
    // widgetowi nie przebudowywać się tylko dlatego, że formularz przepisał stan.
    const onTokenRef = useRef(onToken);
    const onExpireRef = useRef(onExpire);
    const onStatusRef = useRef(onStatus);
    onTokenRef.current = onToken;
    onExpireRef.current = onExpire;
    onStatusRef.current = onStatus;

    /** Stan widżetu idzie w dwa miejsca: do naszej kartki z tekstem i do rodzica, który czeka na token. */
    const reportStatus = (status: TurnstileStatus) => {
      setFailure(status === 'ready' ? null : status);
      if (status === 'ready') setErrorCode(null);
      onStatusRef.current?.(status);
    };

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetId.current && window.turnstile) {
          window.turnstile.reset(widgetId.current);
        }
      },
    }));

    useEffect(() => {
      if (failure || !container.current) return;

      let cancelled = false;
      let api: TurnstileApi | null = null;

      loadTurnstileApi()
        .then((loaded) => {
          if (cancelled || !container.current) return;
          api = loaded;
          const options: TurnstileRenderOptions = {
            sitekey,
            theme: 'dark',
            size: 'flexible',
            callback: (token) => onTokenRef.current(token),
            'expired-callback': () => {
              onExpireRef.current();
              setFailure(null);
            },
            'error-callback': (errorCode) => {
              // Sam challenge też może zostać odrzucony. Odczyszczamy token i mówimy rodzicowi,
              // żeby nie czekał na token, który przy tej przyczynie nie padnie.
              onExpireRef.current();
              // Kod od Cloudflare jest jedyną rzeczą odróżniającą „sitekey bez tego hostnameu"
              // od „rozszerzenie przeglądarki zabiło challenge" — bez niego raport jest bezużyteczny.
              setErrorCode(errorCode?.trim() ? errorCode.trim() : null);
              reportStatus('rejected');
            },
          };
          // Parametr dołączamy tylko wtedy, gdy rodzic go wybrał — Cloudflare waliduje każdą
          // wartość, którą dostanie, a domyślne 'always' ma jego własny brak parametru.
          if (appearance) options.appearance = appearance;

          try {
            widgetId.current = loaded.render(container.current, options);
            // Udany render kasuje w rodzicu pamięć o dawnej awarii — bez tego ponowna próba
            // nigdy doczekałaby się tokenu.
            reportStatus('ready');
          } catch (renderError) {
            // Odrzucony sitekey albo odmowa Cloudflare to nie to samo co zablokowany skrypt —
            // bez rozdzielania tych dwóch ścieżek mówiliśmy nauczycielowi nieprawdę.
            console.warn('[Turnstile] rejected: render() nie przyjął widgetu', renderError);
            if (!cancelled) reportStatus('rejected');
          }
        })
        .catch((error: LoadFailure) => {
          // `fail()` zapisał już powód w ostrzeżeniu; tu przekazujemy tylko stan do UI i rodzica.
          if (!cancelled) reportStatus(error.failure ?? 'blocked');
        });

      return () => {
        cancelled = true;
        if (widgetId.current && api) {
          api.remove(widgetId.current);
          widgetId.current = null;
        }
      };
      // sitekey przychodzi z backendu i nie zmienia się w życiu formularza; appearance jest
      // ustawione raz przy montowaniu; retryKey to jedyny powód, żeby renderować ponownie.
    }, [sitekey, appearance, retryKey, failure]);

    if (failure) {
      const FAILURE_TEXT: Record<TurnstileFailure, string> = {
        blocked:
          'Weryfikacja przeciw robotom nie chciała się wczytać — zwykle robi to blokada reklam albo sieć. Bez niej nie możemy Cię przepuścić.',
        unavailable:
          'Weryfikacja przeciw robotom wczytała się, ale nie wystartowała. Spróbuj ponownie za chwilę albo odśwież stronę.',
        rejected:
          'Cloudflare odmówił tej weryfikacji. Spróbuj ponownie — jeśli to będzie wracać, problem leży po stronie serwisu, nie Twojej.',
      };

      return (
        <div
          role="alert"
          className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-3 sm:p-4"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-rose-300 leading-relaxed">{FAILURE_TEXT[failure]}</p>
              {failure === 'rejected' && errorCode && (
                <p className="mt-1 text-xs text-rose-400/90">Kod Cloudflare: {errorCode}</p>
              )}
              <button
                type="button"
                onClick={() => {
                  setFailure(null);
                  setErrorCode(null);
                  setRetryKey((key) => key + 1);
                }}
                className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-xl text-slate-200 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 transition-colors cursor-pointer min-h-11"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Spróbuj wczytać ponownie
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        <div ref={container} />
        {hint && <p className="text-xs text-slate-400 leading-relaxed">{hint}</p>}
      </div>
    );
  }
);

export default TurnstileWidget;
