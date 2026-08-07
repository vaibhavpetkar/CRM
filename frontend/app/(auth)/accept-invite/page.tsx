'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import Button from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { authApi } from '@/lib/api';

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [verifying, setVerifying] = useState(true);
  const [invitedUser, setInvitedUser] = useState<{ email: string; firstName: string; lastName: string } | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No invitation token provided.');
      setVerifying(false);
      return;
    }

    async function checkToken() {
      try {
        const data = await authApi.verifyInvite(token as string);
        setInvitedUser(data);
        setFirstName(data.firstName || '');
        setLastName(data.lastName || '');
      } catch (err: any) {
        setError(err.message || 'Invalid or expired invitation link.');
      } finally {
        setVerifying(false);
      }
    }

    checkToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await authApi.acceptInvite({
        token: token as string,
        password,
        firstName,
        lastName,
      });
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to accept invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  if (verifying) {
    return (
      <div className="w-full max-w-md text-center py-12">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-sm text-slate-500">Verifying your invitation...</p>
      </div>
    );
  }

  if (error && !invitedUser) {
    return (
      <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-red-600">Invitation Invalid</h2>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <div className="mt-6">
          <Link href="/login" className="text-sm font-medium text-[#168eea] hover:underline">
            ← Return to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-semibold text-slate-900">Accept Invitation</h1>
      <p className="mt-2 text-sm text-slate-500">
        Set your password to activate your account for <span className="font-medium text-slate-900">{invitedUser?.email}</span>.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">First Name</label>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Last Name</label>
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Set Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 6 characters"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Confirm Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat password"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-[#168eea] focus:outline-none focus:ring-1 focus:ring-[#168eea]"
          />
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Setting up account...' : 'Activate & Sign In'}
        </Button>
      </form>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<LoadingSpinner size="lg" />}>
      <AcceptInviteForm />
    </Suspense>
  );
}
