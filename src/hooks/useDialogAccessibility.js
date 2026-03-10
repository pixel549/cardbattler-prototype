import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isFocusable(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hasAttribute('disabled')) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;
  return element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0;
}

export default function useDialogAccessibility(open, { containerRef, onClose, initialFocusRef = null }) {
  const previousActiveRef = useRef(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;

    previousActiveRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const container = containerRef?.current instanceof HTMLElement ? containerRef.current : null;
    const focusables = container
      ? Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isFocusable)
      : [];
    const focusTarget = initialFocusRef?.current ?? focusables[0] ?? container;
    const focusTimer = window.setTimeout(() => {
      focusTarget?.focus?.();
    }, 0);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && onClose) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !container) return;

      const loopable = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isFocusable);
      if (loopable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = loopable[0];
      const last = loopable[loopable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);

      const previousActive = previousActiveRef.current;
      if (previousActive?.isConnected) {
        previousActive.focus();
      }
    };
  }, [containerRef, initialFocusRef, onClose, open]);
}
