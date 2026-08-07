'use client';

import { useEffect } from 'react';

type ShortcutHandlers = {
  /** Esc — close the open modal/popup or cancel the current form. */
  onEscape?: () => void;
  /** Ctrl+S / Cmd+S — save the current form. Browser's native save dialog is always suppressed. */
  onSave?: () => void;
  /** Ctrl+D / Cmd+D — delete the current/selected row. Browser's native bookmark dialog is always suppressed. */
  onDelete?: () => void;
  /** Set to false to temporarily disable all shortcuts (e.g. while a modal isn't open). Defaults to true. */
  enabled?: boolean;
};

export function useKeyboardShortcuts({ onEscape, onSave, onDelete, enabled = true }: ShortcutHandlers) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's';
      const isDelete = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd';

      if (isSave) {
        // Always prevent the browser's native "Save Page" dialog, even if there's
        // no onSave handler wired up on this particular view.
        e.preventDefault();
        onSave?.();
        return;
      }
      if (isDelete) {
        // Always prevent the browser's native "Bookmark this page" dialog.
        e.preventDefault();
        onDelete?.();
        return;
      }
      if (e.key === 'Escape') {
        onEscape?.();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape, onSave, onDelete, enabled]);
}
