'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authApi, getAuthToken, removeAuthToken } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import { navigation } from '@/lib/navigation';
import LoadingSpinner from '@/components/ui/loading-spinner';

function findPermissionForPath(pathname: string): string | undefined {
  for (const section of navigation) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(item.href + '/')) {
        return item.permission;
      }
    }
  }
  return undefined;
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<'checking' | 'ok' | 'forbidden'>('checking');

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      const token = getAuthToken();
      if (!token) {
        router.replace('/login');
        return;
      }

      try {
        // Confirms the token is still valid and refreshes the cached user/role/permissions.
        const user = await authApi.getMe();
        if (cancelled) return;

        const required = findPermissionForPath(pathname);
        if (!hasPermission(user, required)) {
          setStatus('forbidden');
          return;
        }
        setStatus('ok');
      } catch {
        if (cancelled) return;
        removeAuthToken();
        router.replace('/login');
      }
    }

    verify();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (status === 'checking') {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (status === 'forbidden') {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center text-center">
        <h1 className="text-xl font-semibold text-slate-900">You don&apos;t have access to this page</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          Your role doesn&apos;t include permission for this section. Contact your administrator if you believe this
          is a mistake.
        </p>
        <button
          onClick={() => router.replace('/dashboard')}
          className="mt-4 rounded-md bg-[#168eea] px-4 py-2 text-sm font-medium text-white hover:bg-[#1278cc]"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
