'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// My Profile now lives inside Settings (Settings > Profile), alongside the
// rest of the account's personal settings instead of a separate top-level
// page. This route is kept only so old bookmarks/links (and Google's OAuth
// redirect, in case a stale deploy still points here) keep working.
export default function ProfileRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(`/settings?tab=profile${query ? `&${query}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
