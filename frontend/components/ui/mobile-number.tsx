'use client';

import { flagEmoji, formatMobile, parseMobile } from '@/lib/phone-country';
import { cn } from '@/lib/utils';

/** A lead's mobile with its country flag in front ("🇮🇳 98765 43210", "🇦🇪 +971 501234567"). */
export default function MobileNumber({ value, className }: { value?: string | null; className?: string }) {
  if (!value) return <span className={className}>—</span>;
  const p = parseMobile(value);
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span aria-label={p?.country.name || 'Unknown country'} title={p?.country.name || 'Country not recognised'} className="text-base leading-none">
        {p ? flagEmoji(p.country.iso) : '❔'}
      </span>
      <span>{p ? formatMobile(value) : value}</span>
    </span>
  );
}

/** The flag for whatever is typed so far (India for 10 digits), for inside a mobile input. */
export function MobileFlag({ value }: { value?: string | null }) {
  const p = parseMobile(value);
  return (
    <span title={p?.country.name || 'Type 10 digits for India, or + and the country code'} className="text-base leading-none">
      {p ? flagEmoji(p.country.iso) : '🇮🇳'}
    </span>
  );
}
