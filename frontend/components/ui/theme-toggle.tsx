'use client';

import { useSyncExternalStore } from 'react';
import { getTheme, onThemeChange, setTheme } from '@/lib/theme';

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
    <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

/** Light / dark switch. The choice is saved in this browser and applies to every page. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(onThemeChange, getTheme, () => 'light' as const);
  const option = (value: 'light' | 'dark', label: string, icon: React.ReactNode) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={theme === value}
      title={label}
      onClick={() => setTheme(value)}
      className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
        theme === value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      {icon}
    </button>
  );
  return (
    <div className={`flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 ${className}`}>
      {option('light', 'Light mode', <SunIcon />)}
      {option('dark', 'Dark mode', <MoonIcon />)}
    </div>
  );
}
