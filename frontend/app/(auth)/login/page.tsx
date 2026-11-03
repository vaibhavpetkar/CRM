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
    `w-full rounded-xl border bg-white py-2.5 pl-10 pr-3.5 text-[0.84rem] text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-[var(--auth-blue)] focus:ring-[3px] focus:ring-[#1668e3]/15 sm:py-3 ${
      invalid ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : 'border-slate-200'
    }`;

  return (
    <div className="flex w-full flex-col">
      <Script
        src="https://accounts.google.com/gsi/client"
        onLoad={initGoogleAuth}
        strategy="afterInteractive"
      />

      <div className="mb-5">
        <h1 className="flex items-center gap-1.5 whitespace-nowrap text-[1.45rem] font-extrabold leading-tight tracking-tight text-[var(--auth-ink)] sm:text-[1.5rem]">
          Welcome Back! <span className="auth-wave">👋</span>
        </h1>
        <p className="mt-1 text-[0.78rem] text-slate-500">
          Sign in to continue to <span className="font-semibold text-[var(--auth-blue)]">Inveon One CRM</span>
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[0.8rem] font-medium text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-[0.75rem] font-semibold text-slate-700">
            Email Address
          </label>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <input id="email" type="email" autoComplete="email" placeholder="Enter your email" {...register('email')} className={inputClass(!!errors.email)} />
          </div>
          {errors.email && <p className="text-xs font-medium text-red-500">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-[0.75rem] font-semibold text-slate-700">
              Password
            </label>
            <Link href="/forgot-password" className="text-[0.72rem] font-semibold text-[var(--auth-blue)] hover:underline">
              Forgot Password?
            </Link>
          </div>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <PasswordInput id="password" autoComplete="current-password" placeholder="Enter your password" {...register('password')} className={inputClass(!!errors.password)} />
          </div>
          {errors.password && <p className="text-xs font-medium text-red-500">{errors.password.message}</p>}
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <label className="flex cursor-pointer select-none items-center gap-2">
            <input type="checkbox" defaultChecked className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-[#1668e3]" />
            <span className="text-[0.75rem] font-medium text-slate-700">Remember me</span>
          </label>
          <span className="text-[0.72rem] text-slate-400">Keep me signed in</span>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="group w-full rounded-xl bg-[#1668e3] px-4 py-3 text-[0.84rem] font-bold text-white shadow-md shadow-blue-500/20 hover:bg-[#1258c7] active:scale-[0.99]"
        >
          {loading ? 'Signing in…' : 'Sign In'}
          {!loading && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-hover:translate-x-1">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          )}
        </Button>

        <div className="flex items-center py-1">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="px-3 text-[0.65rem] font-bold tracking-wider text-slate-400">OR</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        {/* Our button is what you see; Google's real button sits invisibly on top and takes the click. */}
        <div className="relative">
          <div className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[0.8125rem] font-medium text-slate-700 shadow-sm sm:py-3">
            <svg viewBox="0 0 24 24" className="h-4 w-4">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
            </svg>
            Continue with Google
          </div>
          <div id="googleSignInBtn" className="absolute inset-0 overflow-hidden opacity-0 [&>div]:!h-full [&_iframe]:!h-full [&_iframe]:!w-full" />
        </div>
      </form>

      <p className="mt-4 text-center text-[0.72rem] text-slate-500">
        Having trouble?{' '}
        <Link href="/contact" className="font-medium text-[var(--auth-blue)] hover:underline">
          Contact your administrator
        </Link>
      </p>
    </div>
  );
}
