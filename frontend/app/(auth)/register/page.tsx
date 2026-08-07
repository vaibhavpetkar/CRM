'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/ui/loading-spinner';

// Public self-registration has been disabled. New accounts are created only by an
// administrator sending an invitation (Team → Invite Member), which emails the
// recipient a one-time link where they set their own password.
export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/login'), 2500);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="w-full max-w-md text-center">
      <LoadingSpinner size="lg" />
      <h1 className="mt-6 text-xl font-semibold text-slate-900">Self-registration is disabled</h1>
      <p className="mt-2 text-sm text-slate-500">
        New accounts are created by an administrator invitation only. If you were expecting
        access, ask your administrator to invite you from the Team page.
      </p>
      <p className="mt-4 text-sm text-slate-500">
        Redirecting to{' '}
        <Link href="/login" className="font-medium text-[#168eea] hover:underline">
          Sign In
        </Link>
        ...
      </p>
    </div>
  );
}
