import { cn } from '@/lib/utils';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
};

const variants = {
  primary: 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]',
  secondary: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-red-500 text-white hover:bg-red-600',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
