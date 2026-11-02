'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Button from '@/components/ui/button';
import { authApi, setLastCompanyCode } from '@/lib/api';
import PasswordInput from '@/components/ui/password-input';

declare global {
  interface Window {
    google?: any;
  }
}

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const handleGoogleCallback = async (response: any) => {
    setLoading(true);
    setError(null);
    try {
      await authApi.googleLogin(response.credential);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed.');
    } finally {
      setLoading(false);
    }
  };

  const initGoogleAuth = () => {
    if (window.google?.accounts?.id) {
      try {
        const clientId =
          process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
          '1080645167299-90ctrqd3v23t3sqiq97qp434p97npak7.apps.googleusercontent.com';

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCallback,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        const buttonContainer = document.getElementById('googleSignInBtn');
        if (buttonContainer) {
          window.google.accounts.id.renderButton(buttonContainer, {
            theme: 'outline',
            size: 'large',
            // Google caps the button at 400px; the visible button above is ours.
            width: Math.min(400, Math.round(buttonContainer.getBoundingClientRect().width) || 340),
          });
        }
      } catch (err) {
        console.warn('Google Sign-In initialization deferred:', err);
      }
    }
  };

  useEffect(() => {
    initGoogleAuth();
  }, []);

  const onSubmit = async (data: LoginFormValues) => {
    setLoading(true);
    setError(null);

    try {
      const res = await authApi.login(data);
      setLastCompanyCode(res.company?.code);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (invalid: boolean) =>
    `h-12 w-full rounded-xl border bg-slate-50 pl-11 pr-3 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--primary)]/15 focus:border-[var(--primary)] sm:text-base ${
      invalid ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : 'border-slate-200'
    }`;

  return (
    <div className="flex w-full flex-col">
      <Script
        src="https://accounts.google.com/gsi/client"
        onLoad={initGoogleAuth}
        strategy="afterInteractive"
      />

      <span className="text-xs font-bold uppercase tracking-wider text-[var(--primary)]">Secure sign-in</span>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Welcome back 👋</h1>
      <p className="mt-2 text-sm text-slate-600 sm:text-base">
        Sign in to continue to <span className="font-semibold text-[var(--primary)]">Inveon One CRM</span>
      </p>

      {error && (
        <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-800">
            Email address
          </label>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400">
              <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z" stroke="currentColor" strokeWidth="1.6" />
              <path d="m4 6.5 8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input id="email" type="email" autoComplete="email" placeholder="you@company.com" {...register('email')} className={inputClass(!!errors.email)} />
          </div>
          {errors.email && <p className="mt-1.5 text-xs font-medium text-red-500">{errors.email.message}</p>}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-semibold text-slate-800">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs font-semibold text-[var(--primary)] hover:underline sm:text-sm">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400">
              <rect x="5" y="10.5" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <PasswordInput id="password" autoComplete="current-password" placeholder="Enter your password" {...register('password')} className={inputClass(!!errors.password)} />
          </div>
          {errors.password && <p className="mt-1.5 text-xs font-medium text-red-500">{errors.password.message}</p>}
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 accent-[var(--auth-btn)]" />
          Keep me signed in
        </label>

        <Button
          type="submit"
          disabled={loading}
          className="h-12 w-full rounded-xl bg-[var(--auth-btn)] text-base font-semibold shadow-lg shadow-[#5f259f]/25 hover:bg-[var(--auth-btn-hover)]"
        >
          {loading ? 'Signing in…' : 'Sign in'}
          {!loading && (
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      {/* Our button is what you see; Google's real button sits invisibly on top and takes the click. */}
      <div className="relative">
        <div className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 shadow-sm sm:text-base">
          <svg viewBox="0 0 48 48" className="h-5 w-5">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Continue with Google
        </div>
        <div id="googleSignInBtn" className="absolute inset-0 overflow-hidden opacity-0 [&>div]:!h-full [&_iframe]:!h-full [&_iframe]:!w-full" />
      </div>

      <p className="mt-6 rounded-xl bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">
        Having trouble?{' '}
        <Link href="/contact" className="font-semibold text-[var(--primary)] hover:underline">
          Contact your administrator
        </Link>
      </p>
    </div>
  );
}
