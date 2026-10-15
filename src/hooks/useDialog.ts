import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'audio[controls]',
  'video[controls]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Elementy niewidzialne dla klawiatury — `display: none` albo zero wymiarów — wypadają z pułapki,
 * inaczej Tab krążyłby po sterach ukrytych w zamkniętych gałęziach dialogu.
 */
function isReachable(element: HTMLElement): boolean {
  return element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0;
}

/**
 * Zachowanie okna dialogowego: fokus wchodzi do środka i z niego nie wychodzi (Tab i Shift+Tab
 * są zawracane na brzegach), Escape zamyka, tło pod oknem nie przewija się, a po zamknięciu fokus
 * wraca na element, który okno otworzył.
 *
 * Bez tego fokus po otwarciu zostaje na przycisku z tła, a Tab przechodzi do nawigacji sidebaru
 * stojącej za zaciemnieniem — użytkownik klawiatury klika wtedy coś, czego nie widzi.
 *
 * Dwa efekty są celowo rozdzielone: wejście fokusów i blokadę przewijania wiążemy wyłącznie
 * z `open`, a słuchacza klawiatury z `onClose`. Callbacki twórców okna zmieniają tożsamość
 * przy każdym ich renderze, a przerzucanie fokusów przy każdym renderze rodzica byłoby błędem.
 */
export function useDialog(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>
): void {
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const container = containerRef.current;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const target = initialFocusRef?.current ?? container;
    target?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;

      // Skoro fokus wciąż siedzi w oknie, to okno go właśnie zabiera z powrotem na wywołujący ster.
      const focused = document.activeElement;
      if (container && focused && container.contains(focused)) {
        restoreRef.current?.focus();
      }
    };
  }, [open, containerRef, initialFocusRef]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isReachable);

      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = active instanceof HTMLElement && container.contains(active);

      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, containerRef]);
}
