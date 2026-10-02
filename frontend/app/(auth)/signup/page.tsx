'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Button from '@/components/ui/button';
import { authApi, setLastCompanyCode } from '@/lib/api';

const signupSchema = z
  .object({
    companyName: z.string().trim().min(2, 'Company name is required'),
    companyCode: z
      .string()
      .trim()
      .toLowerCase()
      .refine((v) => v === '' || /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(v), '3-30 lowercase letters, numbers or dashes')
      .optional(),
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
    email: z.string().email('Please enter a valid email address'),
    phone: z.string().optional(),
    password: z.string().min(8, 'Use at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

type SignupFormValues = z.infer<typeof signupSchema>;

const inputClass = (hasError: boolean) =>
  `w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)] transition-all ${
    hasError ? 'ring-1 ring-red-500 bg-red-50/30 focus:ring-red-500' : ''
  }`;

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupSchema) });

  const onSubmit = async (values: SignupFormValues) => {
    setLoading(true);
    setError(null);
    try {
      const { companyName, companyCode, firstName, lastName, email, phone, password } = values;
      const res = await authApi.signupCompany({ companyName, companyCode: companyCode || undefined, firstName, lastName, email, phone, password });
      setLastCompanyCode(res.company?.code);
      router.push('/dashboard');
    } catch (err) {
      setError((err as Error).message || 'Could not create your company. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const field = (name: keyof SignupFormValues, label: string, type = 'text', placeholder = '') => (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
      <input type={type} placeholder={placeholder} {...register(name)} className={inputClass(!!errors[name])} />
      {errors[name] && <p className="mt-1.5 text-xs text-red-500 font-medium">{errors[name]?.message}</p>}
    </div>
  );

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200/70 bg-[var(--card-bg)] p-8 shadow-xl shadow-slate-200/50 sm:p-10">
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Start your free trial</h1>
      <p className="mt-1.5 text-sm text-slate-500">15 days free, no card needed. Set up your company and invite your team.</p>

      {error && (
        <div className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600 font-medium">{error}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        {field('companyName', 'Company name', 'text', 'Your company')}
        {field('companyCode', 'Company code (optional)', 'text', 'Used by your team to sign in, e.g. acme')}
        <div className="grid grid-cols-2 gap-3">
          {field('firstName', 'First name')}
          {field('lastName', 'Last name')}
        </div>
        {field('email', 'Work email', 'email', 'you@company.com')}
        {field('phone', 'Phone (optional)', 'tel')}
        {field('password', 'Password', 'password')}
        {field('confirmPassword', 'Confirm password', 'password')}

        <Button
          type="submit"
          disabled={loading}
          className="w-full mt-1 bg-gradient-to-r from-[var(--primary)] to-blue-600 py-3 text-sm font-semibold shadow-md shadow-[var(--primary)]/20 hover:opacity-95"
        >
          {loading ? 'Creating your company...' : 'Create company'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-[var(--primary)] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
