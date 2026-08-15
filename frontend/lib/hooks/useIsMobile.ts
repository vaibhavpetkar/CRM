'use client';

import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 767px)'; // matches Tailwind's default `md` breakpoint

/**
 * True below the `md` breakpoint. Used where a component needs to change
 * actual DOM output (not just CSS) between mobile and desktop — e.g. the
 * sidebar always showing full labels on mobile instead of icon-only mode,
 * regardless of the desktop collapse toggle.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
