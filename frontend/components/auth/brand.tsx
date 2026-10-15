'use client';

import { useId } from 'react';

/**
 * Inveon One CRM brand pieces for the sign-in screens: the product logo,
 * the "Powered by Inveon Technologies" mark and the hero artwork.
 * Drawn with SVG/CSS so they stay sharp and follow light/dark mode.
 */

/** "INVEON / (1)NE / CRM" stacked product logo. */
export function InveonOneLogo({ className = '' }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg viewBox="0 0 260 150" className={className} role="img" aria-label="Inveon One CRM">
      <defs>
        <linearGradient id={`io-ring${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b8bff" />
          <stop offset="1" stopColor="#0047d6" />
        </linearGradient>
        <linearGradient id={`io-one${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb02e" />
          <stop offset="1" stopColor="#ff6a00" />
        </linearGradient>
      </defs>

      {/* INVEON, letter by letter; the E is three bars with a brand-blue middle */}
      <g className="fill-[#0b1a3a] dark:fill-white" fontSize="34" fontWeight="800" fontFamily="inherit" textAnchor="middle">
        <text x="9" y="32">I</text>
        <text x="50" y="32">N</text>
        <text x="94" y="32">V</text>
        <rect x="124" y="7.5" width="24" height="5" rx="1" />
        <rect x="124" y="27" width="24" height="5" rx="1" />
        <text x="183" y="32">O</text>
        <text x="232" y="32">N</text>
      </g>
      <rect x="124" y="17.3" width="20" height="5" rx="1" fill="#0066ff" />

      {/* ONE: blue ring with an orange 1 */}
      <circle cx="40" cy="80" r="30" fill="none" stroke={`url(#io-ring${id})`} strokeWidth="13" />
      <path d="M34 68 l12 -7 v39 h-10.5 V75 l-6 3.5 z" fill={`url(#io-one${id})`} />
      <text x="76" y="110" fontSize="78" fontWeight="900" letterSpacing="-2" fontFamily="inherit" className="fill-[#0b1a3a] dark:fill-white">
        NE
      </text>

      {/* — CRM — */}
      <line x1="0" y1="133" x2="52" y2="133" stroke="#0066ff" strokeWidth="1.5" />
      <text x="130" y="140" textAnchor="middle" fontSize="21" fontWeight="600" letterSpacing="12" fill="#0066ff" fontFamily="inherit">
        CRM
      </text>
      <line x1="208" y1="133" x2="260" y2="133" stroke="#0066ff" strokeWidth="1.5" />
    </svg>
  );
}

/** "IV" monogram over INVEON TECHNOLOGIES, shown under "Powered by". */
export function InveonTechLogo({ className = '' }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg viewBox="0 0 140 92" className={className} role="img" aria-label="Inveon Technologies">
      <defs>
        <linearGradient id={`it-v${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b8bff" />
          <stop offset="1" stopColor="#0047d6" />
        </linearGradient>
      </defs>
      <rect x="47" y="8" width="8" height="38" className="fill-[#0b1a3a] dark:fill-white" />
      <path d="M58 8 h9 l8 26 l8 -26 h9 l-14 38 h-6 z" fill={`url(#it-v${id})`} />
      <path d="M86 8 h9 l-4 11 z" fill="#ff8a00" />
      <text x="70" y="68" textAnchor="middle" fontSize="17" fontWeight="600" letterSpacing="5" className="fill-[#0b1a3a] dark:fill-white" fontFamily="inherit">
        INVEON
      </text>
      <line x1="10" y1="80" x2="30" y2="80" className="stroke-slate-400" strokeWidth="0.8" />
      <text x="70" y="83" textAnchor="middle" fontSize="7" fontWeight="600" letterSpacing="2.4" fill="#0066ff" fontFamily="inherit">
        TECHNOLOGIES
      </text>
      <line x1="110" y1="80" x2="130" y2="80" className="stroke-slate-400" strokeWidth="0.8" />
    </svg>
  );
}

const bubble =
  'absolute flex h-12 w-12 items-center justify-center rounded-full bg-white text-[var(--primary)] shadow-lg shadow-blue-900/10 dark:bg-[#1a2540]';

/** Glowing "1" monument inside an orbit of module icons. */
export function HeroArt({ className = '' }: { className?: string }) {
  return (
    <div className={`relative aspect-square ${className}`} aria-hidden="true">
      {/* soft floor glow */}
      <div className="absolute bottom-[6%] left-1/2 h-[22%] w-[90%] -translate-x-1/2 rounded-[50%] bg-gradient-to-r from-orange-200/40 via-white/70 to-blue-200/40 blur-2xl dark:via-blue-400/10" />

      {/* orbit */}
      <div className="absolute inset-[4%] rounded-full border border-[var(--primary)]/30" />
      <div className="absolute inset-[4%] rounded-full border-2 border-dashed border-[var(--primary)]/10" />
      {['left-[14%] top-[15%]', 'right-[9%] top-[30%]', 'left-[7%] bottom-[34%]', 'right-[14%] bottom-[18%]'].map((p) => (
        <span key={p} className={`absolute h-1.5 w-1.5 rounded-full bg-[var(--primary)]/60 ${p}`} />
      ))}

      {/* outer ring */}
      <div className="absolute inset-[22%] rounded-full bg-gradient-to-br from-white via-slate-100 to-indigo-200 shadow-[0_30px_60px_-20px_rgba(30,58,138,0.35)] dark:from-[#2a3754] dark:via-[#1a2540] dark:to-[#141c33]" />
      <div className="absolute inset-[30%] rounded-full bg-gradient-to-br from-indigo-100 to-white dark:from-[#0f1729] dark:to-[#1a2540]" />
      {/* inner glowing ring */}
      <div className="absolute inset-[33%] rounded-full border-[10px] border-orange-300 shadow-[0_0_40px_10px_rgba(255,153,51,0.45),inset_0_0_30px_rgba(255,153,51,0.5)]" />
      <div className="absolute inset-[38%] rounded-full bg-gradient-to-br from-white to-orange-50 dark:from-[#1a2540] dark:to-[#0f1729]" />

      {/* the "1" slab */}
      <div className="absolute left-[30%] top-[28%] h-[52%] w-[17%] skew-y-[8deg] rounded-sm bg-gradient-to-b from-white to-slate-200 shadow-[12px_10px_30px_rgba(30,58,138,0.25)] dark:from-[#8a9bb8] dark:to-[#4a5a78]" />
      <div className="absolute left-[26%] top-[30%] h-[10%] w-[8%] -skew-y-[30deg] rounded-sm bg-gradient-to-b from-white to-slate-200 dark:from-[#8a9bb8] dark:to-[#4a5a78]" />

      {/* orbiting module icons */}
      <span className={`${bubble} left-[12%] top-[6%]`}>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
          <circle cx="9" cy="8" r="3.2" />
          <circle cx="16.5" cy="9" r="2.5" opacity=".6" />
          <path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5z" />
          <path d="M15.5 19c0-1.9-.6-3.4-1.6-4.5 2.9-.4 6.1 1.2 6.1 4.5z" opacity=".6" />
        </svg>
      </span>
      <span className={`${bubble} right-[12%] top-[14%]`}>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
          <path d="M1.5 7.5 6 6l6.5 7.2a1.6 1.6 0 0 1-2.3 2.2L8.8 14l-.4.4 1.4 1.4a1.5 1.5 0 0 1-2.1 2.1l-.5-.5a1.5 1.5 0 0 1-2.4.1L1.5 14z" />
          <path d="M22.5 7.5 18 6l-4.8 1.6-3 3a1.6 1.6 0 0 0 2.3 2.2l2-2 4.2 4.6 3.8-1.6z" opacity=".75" />
        </svg>
      </span>
      <span className={`${bubble} left-[2%] top-[56%]`}>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
          <rect x="4" y="13" width="3.5" height="7" rx="1" />
          <rect x="10.2" y="9" width="3.5" height="11" rx="1" />
          <rect x="16.5" y="5" width="3.5" height="15" rx="1" />
        </svg>
      </span>
      <span className={`${bubble} right-[2%] top-[54%]`}>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
          <path d="M3 10v4h3l6 4.5v-13L6 10z" />
          <path d="M15 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </svg>
      </span>
    </div>
  );
}
