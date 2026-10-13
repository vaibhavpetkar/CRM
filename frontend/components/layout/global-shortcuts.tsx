'use client';

import { useEffect } from 'react';
import { isShortcutHandled } from '@/lib/hooks/useKeyboardShortcuts';

// App-wide keyboard shortcuts, so every screen gets them without wiring each
// form by hand:
//   Ctrl/Cmd+S  save the open popup's form (or the page's only form)
//   Esc         close the open popup
//   Alt+N, Ctrl/Cmd+N  open a new entry (the page's "Add ..." / "New ..." button)
// Chrome keeps Ctrl+N for "new window" and never hands it to a web page, so
// Alt+N is the one that works everywhere; Ctrl+N still works where the
// browser allows it (Firefox, the installed app).
// A page that wires useKeyboardShortcuts itself wins for Ctrl+S: its handler
// runs first and marks the key press as handled.

const isVisible = (el: Element) => (el as HTMLElement).getClientRects().length > 0;

// Popups are full-screen overlays (fixed inset-0) or dialogs; the last one in
// the page is the one on top.
function topPopup(): HTMLElement | null {
  const popups = Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0, [role="dialog"]')).filter(
    (el) => isVisible(el) && el.querySelector('button, form')
  );
  return popups[popups.length - 1] || null;
}

const buttonText = (b: HTMLElement) => (b.textContent || '').replace(/\s+/g, ' ').trim();

function visibleButtons(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button, a[href]')).filter(
    (b) => isVisible(b) && !(b as HTMLButtonElement).disabled
  );
}

function closePopup(popup: HTMLElement) {
  const buttons = visibleButtons(popup);
  const close =
    buttons.find((b) => /^(close|cancel)$/i.test(b.getAttribute('aria-label') || '')) ||
    buttons.find((b) => /^(cancel|close)$/i.test(buttonText(b))) ||
    // The header's X icon button
    buttons.find((b) => !buttonText(b) && b.querySelector('svg'));
  if (close) {
    close.click();
    return true;
  }
  return false;
}

function save(popup: HTMLElement | null) {
  const scope: ParentNode = popup || document.querySelector('main') || document;
  const forms = Array.from(scope.querySelectorAll<HTMLFormElement>('form')).filter(isVisible);
  if (forms.length === 1 || (popup && forms.length > 0)) {
    forms[forms.length - 1].requestSubmit();
    return true;
  }
  const saveButton = visibleButtons(scope).find((b) => /^(save|update)\b/i.test(buttonText(b)));
  if (saveButton) {
    saveButton.click();
    return true;
  }
  return false;
}

function openNew() {
  const actions = document.querySelector('[data-page-actions]');
  const add = actions && visibleButtons(actions).find((b) => /^\+?\s*(add|new|create)\b/i.test(buttonText(b)));
  if (add) {
    add.click();
    return true;
  }
  return false;
}

export default function GlobalShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Let an open dropdown (autocomplete, select) close itself first.
        const active = document.activeElement;
        if (active?.getAttribute('aria-expanded') === 'true') return;
        const popup = topPopup();
        if (!popup) return;
        // A page's own Esc handler often covers only its main form, so check on
        // the next frame and close the popup only if it is still open.
        requestAnimationFrame(() => {
          if (popup.isConnected && popup === topPopup()) closePopup(popup);
        });
        return;
      }
      if (isShortcutHandled(e)) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && !e.altKey && key === 's') {
        e.preventDefault();
        save(topPopup());
        return;
      }
      if ((e.altKey && !mod && (key === 'n' || e.code === 'KeyN')) || (mod && !e.altKey && !e.shiftKey && key === 'n')) {
        if (topPopup()) return;
        if (openNew()) e.preventDefault();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return null;
}
