import logoUrl from '../assets/belfero-logo.svg';

/**
 * Lockup marki ze stron logowania, rejestracji i weryfikacji.
 * width/height są po to, żeby obraz nie przesuwał treści przed wczytaniem.
 * To nie jest nagłówek: tytuł widoku nosi sama strona (jej `h1`), a ten element powtarza się
 * na każdym ekranie, więc jako `h1` dorzucałby drugi nagłówek najwyższego stopnia.
 */
export default function BrandMark() {
  return (
    <div className="mb-3 sm:mb-4">
      <div className="flex justify-center">
        <img
          src={logoUrl}
          alt="Belfero"
          width={321}
          height={167}
          className="w-40 sm:w-48 h-auto"
        />
      </div>
      <p className="text-xs text-slate-400 text-center mt-2 sm:mt-3">AI sprawdza za Ciebie</p>
    </div>
  );
}
