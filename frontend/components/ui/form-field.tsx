'use client';

import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
  helperText?: string;
}

export default function FormField({
  label,
  required = false,
  error,
  children,
  className,
  helperText,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs font-medium text-red-500">{error}</p>
      )}
      {!error && helperText && (
        <p className="text-xs text-slate-400">{helperText}</p>
      )}
    </div>
  );
}

// Standard input class strings for consistent styling across all forms
export const inputBaseClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] transition-colors disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed';

export const inputErrorClass =
  'border-red-300 bg-red-50/30 focus:border-red-500 focus:ring-red-500';

export function getInputClassName(hasError?: boolean) {
  return cn(inputBaseClass, hasError && inputErrorClass);
}
