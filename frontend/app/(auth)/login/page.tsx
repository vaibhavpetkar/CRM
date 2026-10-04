'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Button from '@/components/ui/button';
import { authApi, getLastCompanyCode, setLastCompanyCode } from '@/lib/api';
import PasswordInput from '@/components/ui/password-input';
import ThemeToggle from '@/components/ui/theme-toggle';

declare global {
  interface Window {
    google?: any;
  }
}

const loginSchema = z.object({
  companyCode: z.string().trim().min(1, 'Company code is required'),
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
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  // Prefill the company code this browser last signed in with.
  useEffect(() => {
    const last = getLastCompanyCode();
    if (last) setValue('companyCode', last);
  }, [setValue]);

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
            width: '100%',
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
      const res = await authApi.login({ ...data, companyCode: data.companyCode.toLowerCase() });
      setLastCompanyCode(res.company?.code);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200/70 bg-[var(--card-bg)] p-8 shadow-xl shadow-slate-200/50 sm:p-10">
      <Script
        src="https://accounts.google.com/gsi/client"
        onLoad={initGoogleAuth}
        strategy="afterInteractive"
      />

      {/* Mobile-only compact logo */}
      <div className="mb-6 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--primary)] text-sm font-extrabold text-orange-500">1</span>
          <span className="text-lg font-bold text-slate-900 tracking-tight">Inveon One CRM</span>
        </div>
      </div>

      {/* Header row: greeting + light/dark toggle */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 tracking-tight">
            Welcome Back! <span>👋</span>
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Sign in to continue to <span className="font-semibold text-[var(--primary)]">Inveon One CRM</span>
          </p>
        </div>
        <ThemeToggle />
      </div>

      {error && (
        <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600 font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Company Code</label>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
              <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3M2.5 21h19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input
              type="text"
              autoCapitalize="none"
              placeholder="e.g. inveon"
              {...register('companyCode')}
              className={`w-full rounded-lg border border-slate-200 bg-slate-50/60 py-2.5 pl-10 pr-3 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)] transition-all ${
                errors.companyCode ? 'ring-1 ring-red-500 bg-red-50/30 focus:ring-red-500' : ''
              }`}
            />
          </div>
          {errors.companyCode && <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.companyCode.message}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Email Address</label>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
              <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z" stroke="currentColor" strokeWidth="1.6" />
              <path d="m4 6.5 8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input
              type="email"
              placeholder="Enter your email"
              {...register('email')}
              className={`w-full rounded-lg border border-slate-200 bg-slate-50/60 py-2.5 pl-10 pr-3 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)] transition-all ${
                errors.email ? 'ring-1 ring-red-500 bg-red-50/30 focus:ring-red-500' : ''
              }`}
            />
          </div>
          {errors.email && <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.email.message}</p>}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-700">Password</label>
            <Link href="/forgot-password" className="text-xs font-semibold text-[var(--primary)] hover:underline">
              Forgot Password?
            </Link>
          </div>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
              <rect x="5" y="10.5" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <PasswordInput
              placeholder="Enter your password"
              {...register('password')}
              className={`w-full rounded-lg border border-slate-200 bg-slate-50/60 py-2.5 pl-10 pr-3 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)] transition-all ${
                errors.password ? 'ring-1 ring-red-500 bg-red-50/30 focus:ring-red-500' : ''
              }`}
            />
          </div>
          {errors.password && <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.password.message}</p>}
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--primary)]/40" />
            Remember me
          </label>
          <span className="text-xs text-slate-400">Keep me signed in</span>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full mt-1 flex items-center justify-center gap-2 bg-gradient-to-r from-[var(--primary)] to-blue-600 py-3 text-sm font-semibold shadow-md shadow-[var(--primary)]/20 hover:opacity-95"
        >
          {loading ? 'Signing in...' : (
            <>
              Sign In
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </>
          )}
        </Button>
      </form>

      <div className="relative my-7">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
        <div className="relative flex justify-center text-xs"><span className="bg-[var(--card-bg)] px-3 font-semibold text-slate-400">OR</span></div>
      </div>

      <div id="googleSignInBtn" className="w-full flex justify-center"></div>

      <p className="mt-6 text-center text-sm text-slate-500">
        New to Inveon One CRM?{' '}
        <Link href="/signup" className="font-semibold text-[var(--primary)] hover:underline">
          Start a 15-day free trial
        </Link>
      </p>

      <p className="mt-3 text-center text-xs text-slate-400">
        Having trouble?{' '}
        <Link href="/contact" className="font-semibold text-[var(--primary)] hover:underline">
          Contact your administrator
        </Link>
      </p>

      <div className="mt-8 flex flex-col items-center gap-1 border-t border-slate-100 pt-5">
        <span className="text-[10px] font-medium uppercase tracking-widest text-slate-400">Powered by</span>
        <span className="text-sm font-black tracking-tight text-slate-800">INVEON <span className="font-normal text-slate-400">TECHNOLOGIES</span></span>
      </div>
    </div>
  );
}
