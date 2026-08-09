'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Button from '@/components/ui/button';
import { authApi } from '@/lib/api';

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
      await authApi.login(data);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <Script
        src="https://accounts.google.com/gsi/client"
        onLoad={initGoogleAuth}
        strategy="afterInteractive"
      />

      <div className="mb-8 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white shadow-sm">Z</div>
          <span className="text-lg font-bold text-slate-900 tracking-tight">CRM Pro</span>
        </div>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sign in to your account</h1>
      <p className="mt-2 text-sm text-slate-500">
        Access is by administrator invitation only.
      </p>

      {error && (
        <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600 font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Email address</label>
          <input
            type="email"
            placeholder="you@company.com"
            {...register('email')}
            className={`w-full rounded-md border-0 bg-slate-100/50 px-3 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)] transition-all ${
              errors.email ? 'ring-1 ring-red-500 bg-red-50/30 focus:ring-red-500' : ''
            }`}
          />
          {errors.email && <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.email.message}</p>}
        </div>
        
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <Link href="/forgot-password" className="text-xs font-medium text-[var(--primary)] hover:underline">
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            placeholder="Enter your password"
            {...register('password')}
            className={`w-full rounded-md border-0 bg-slate-100/50 px-3 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)] transition-all ${
              errors.password ? 'ring-1 ring-red-500 bg-red-50/30 focus:ring-red-500' : ''
            }`}
          />
          {errors.password && <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.password.message}</p>}
        </div>

        <Button type="submit" className="w-full mt-2" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>

      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
        <div className="relative flex justify-center text-xs"><span className="bg-[var(--background)] px-3 text-slate-400 font-medium">Or continue with</span></div>
      </div>

      <div className="space-y-3">
        <div id="googleSignInBtn" className="w-full flex justify-center"></div>
      </div>
    </div>
  );
}
