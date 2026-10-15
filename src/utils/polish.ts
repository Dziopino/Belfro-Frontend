/**
 * Odmiana rzeczownika po liczebniku: 1 → pierwsza forma, 2-4 (ale już nie 12-14) → druga, reszta → trzecia.
 */
export function pluralPolish(count: number, one: string, few: string, many: string): string {
  const ones = count % 10;
  const teens = count % 100;

  if (count === 1) return one;
  if (ones >= 2 && ones <= 4 && !(teens >= 12 && teens <= 14)) return few;
  return many;
}
