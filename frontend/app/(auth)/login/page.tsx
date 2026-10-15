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
import ThemeToggle from '@/components/ui/theme-toggle';
import { InveonOneLogo, InveonTechLogo } from '@/components/auth/brand';

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
            width: Math.round(buttonContainer.getBoundingClientRect().width) || 340,
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
    `w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-11 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-all ${
      invalid ? 'border-red-400 ring-1 ring-red-400 focus:ring-red-400' : ''
    }`;

  return (
    <div className="flex w-full max-w-[460px] flex-col rounded-[22px] border border-white/80 bg-white/85 px-7 pb-6 pt-5 shadow-[0_20px_60px_-15px_rgba(30,41,90,0.25)] backdrop-blur-xl dark:border-white/10 dark:bg-[var(--card-bg)]/90 sm:px-12 lg:min-h-[calc(100vh-2rem)] lg:max-w-none">
      <Script
        src="https://accounts.google.com/gsi/client"
        onLoad={initGoogleAuth}
        strategy="afterInteractive"
      />

      <div className="mb-4 flex items-center justify-between lg:mb-0 lg:justify-end">
        {/* Compact logo where the hero panel is hidden */}
        <InveonOneLogo className="w-[110px] lg:hidden" />
        <ThemeToggle />
      </div>

      <div className="my-auto pt-2">
        <h1 className="flex items-center gap-2 text-[26px] font-bold tracking-tight text-[#0b1a3a] dark:text-white">
          Welcome Back! <span>👋</span>
        </h1>
        <p className="mt-2 text-[15px] text-slate-600">
          Sign in to continue to <span className="font-medium text-[var(--primary)]">Inveon One CRM</span>
        </p>

        {error && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6" noValidate>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-[#0b1a3a] dark:text-slate-800">
            Email Address
          </label>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute z-10 left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
              <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z" stroke="currentColor" strokeWidth="1.6" />
              <path d="m4 6.5 8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input id="email" type="email" autoComplete="email" placeholder="Enter your email" {...register('email')} className={inputClass(!!errors.email)} />
          </div>
          {errors.email && <p className="mt-1.5 text-xs font-medium text-red-500">{errors.email.message}</p>}

          <div className="mb-2 mt-5 flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-[#0b1a3a] dark:text-slate-800">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs font-medium text-[var(--primary)] hover:underline">
              Forgot Password?
            </Link>
          </div>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute z-10 left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
              <rect x="5" y="10.5" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <PasswordInput id="password" autoComplete="current-password" placeholder="Enter your password" {...register('password')} className={inputClass(!!errors.password)} />
          </div>
          {errors.password && <p className="mt-1.5 text-xs font-medium text-red-500">{errors.password.message}</p>}

          <div className="mt-5 flex items-center justify-between">
            <label className="flex items-center gap-2 text-[13px] text-[#0b1a3a] dark:text-slate-800">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 accent-[var(--primary)]" />
              Remember me
            </label>
            <span className="text-xs text-slate-500">Keep me signed in</span>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="relative mt-5 flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-[#0a5cff] to-[#1f7bff] py-3 text-[15px] font-medium shadow-lg shadow-blue-600/25 hover:opacity-95"
          >
            {loading ? 'Signing in...' : 'Sign In'}
            {!loading && (
              <svg viewBox="0 0 24 24" fill="none" className="absolute right-5 h-4 w-4">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </Button>
        </form>

        <div className="my-4 text-center text-xs font-medium text-slate-500">OR</div>

        {/* Our button is what you see; Google's real button sits invisibly on top and takes the click. */}
        <div className="relative">
          <div className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white py-3 text-sm font-medium text-[#0b1a3a] shadow-sm dark:border-white/15 dark:bg-white/5 dark:text-white">
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

        <p className="mt-6 text-center text-[13px] text-slate-600">
          Having trouble?{' '}
          <Link href="/contact" className="font-medium text-[var(--primary)] hover:underline">
            Contact your administrator
          </Link>
        </p>
      </div>

      <div className="mt-4 flex flex-col items-center">
        <span className="text-xs text-slate-600">Powered by</span>
        <InveonTechLogo className="mt-1 w-[108px]" />
      </div>
    </div>
  );
}
