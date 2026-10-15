import { pluralPolish } from '../utils/polish';

/**
 * Wezwanie do wskazania wariantu w sesji, w której rozpoznawało go AI. Wspólne dla wyników
 * i historii, bo na obu ekranach znaczy dokładnie to samo i musi brzmieć identycznie.
 */
export default function VariantPickNotice({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <div className="bg-amber-950/40 border border-amber-800/50 rounded-xl p-3 sm:p-4" role="status">
      <p className="text-sm text-amber-300 leading-relaxed">
        {count} {pluralPolish(count, 'praca', 'prace', 'prac')} bez rozpoznanego wariantu. AI ich nie ocenił
        i nie pobrał za nie ani jednej strony. Kliknij wiersz takiej pracy, wskaż wariant, który dostał ten
        uczeń, a sprawdzimy ją od nowa z kluczem tego wariantu.
      </p>
    </div>
  );
}
