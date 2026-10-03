'use client';

import { PhoneIcon } from '@heroicons/react/24/solid';
import { cn } from '@/lib/utils';
import { useCalls, type CallTarget } from './call-context';

// Same rule as the backend (utils/indianPhone.ts): a 10-digit Indian number
// after dropping +91 / 91 / 0091 / a trunk 0.
export const isCallableIndianNumber = (value?: string | null) => {
  if (!value) return false;
  const raw = value.trim();
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) {
    if (!digits.startsWith('91')) return false;
    digits = digits.slice(2);
  } else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 14 && digits.startsWith('0091')) digits = digits.slice(4);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[2-9]\d{9}$/.test(digits);
};

/** A green phone icon next to a saved phone number. Clicking it opens the calling panel and dials. */
export default function CallButton({ className, ...target }: CallTarget & { className?: string }) {
  const { startCall, busy } = useCalls();
  if (!isCallableIndianNumber(target.number)) return null;
  return (
    <button
      type="button"
      onClick={() => startCall(target)}
      disabled={busy}
      title={busy ? 'Another call is in progress' : `Call ${target.number}`}
      aria-label={`Call ${target.number}`}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40',
        className
      )}
    >
      <PhoneIcon className="h-4 w-4" />
    </button>
  );
}
