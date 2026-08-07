'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  /** Milliseconds before auto-dismiss. Set to 0 to require manual close. */
  duration?: number;
  title?: string;
}

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  title?: string;
  duration: number;
}

interface ToastContextValue {
  show: (type: ToastType, message: string, options?: ToastOptions) => number;
  success: (message: string, options?: ToastOptions) => number;
  error: (message: string, options?: ToastOptions) => number;
  warning: (message: string, options?: ToastOptions) => number;
  info: (message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4500;

let idCounter = 0;

const TYPE_STYLES: Record<ToastType, { container: string; iconWrap: string; icon: React.ReactNode }> = {
  success: {
    container: 'border-green-500/40 bg-green-50 text-green-900',
    iconWrap: 'bg-green-500 text-white',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
        <path
          fillRule="evenodd"
          d="M16.704 5.29a1 1 0 010 1.415l-7.25 7.25a1 1 0 01-1.415 0l-3.25-3.25a1 1 0 111.415-1.414l2.543 2.543 6.543-6.543a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  error: {
    container: 'border-red-500/40 bg-red-50 text-red-900',
    iconWrap: 'bg-red-500 text-white',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-9a1 1 0 112 0v3a1 1 0 11-2 0V9zm1-4a1 1 0 100 2 1 1 0 000-2z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  warning: {
    container: 'border-yellow-500/40 bg-yellow-50 text-yellow-900',
    iconWrap: 'bg-yellow-500 text-white',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.72-1.36 3.486 0l6.517 11.59c.75 1.334-.213 2.985-1.743 2.985H3.483c-1.53 0-2.493-1.65-1.743-2.985l6.517-11.59zM11 13a1 1 0 10-2 0 1 1 0 002 0zm-1-7a1 1 0 00-1 1v3a1 1 0 002 0V7a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  info: {
    container: 'border-blue-500/40 bg-blue-50 text-blue-900',
    iconWrap: 'bg-blue-500 text-white',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
        <path
          fillRule="evenodd"
          d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9zm1-4a1.25 1.25 0 100 2.5A1.25 1.25 0 0010 5z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
};

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startClose = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onClose(toast.id), 180);
  }, [onClose, toast.id]);

  useEffect(() => {
    if (toast.duration > 0) {
      timerRef.current = setTimeout(startClose, toast.duration);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.duration, startClose]);

  const style = TYPE_STYLES[toast.type];

  return (
    <div
      role="alert"
      className={cn(
        'pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm transition-all duration-200 ease-out',
        style.container,
        leaving ? '-translate-x-4 opacity-0' : 'translate-x-0 opacity-100'
      )}
    >
      <span className={cn('mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full', style.iconWrap)}>
        {style.icon}
      </span>
      <div className="min-w-0 flex-1">
        {toast.title && <p className="text-sm font-semibold leading-5">{toast.title}</p>}
        <p className="text-sm leading-5 break-words">{toast.message}</p>
      </div>
      <button
        onClick={startClose}
        aria-label="Dismiss"
        className="flex-none rounded p-0.5 text-current/60 hover:bg-black/5 hover:text-current"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((type: ToastType, message: string, options?: ToastOptions) => {
    const id = ++idCounter;
    setToasts((prev) => [
      ...prev,
      { id, type, message, title: options?.title, duration: options?.duration ?? DEFAULT_DURATION },
    ]);
    return id;
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (message, options) => show('success', message, options),
      error: (message, options) => show('error', message, options),
      warning: (message, options) => show('warning', message, options),
      info: (message, options) => show('info', message, options),
      dismiss,
    }),
    [show, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed left-4 top-4 z-[9999] flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Hook for use inside components: const toast = useToast(); toast.success('Saved!');
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
