import { cva } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';

import { cn } from '../lib/utils.js';

const styles = cva(
  'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-sky-700 text-white hover:bg-sky-800',
        secondary:
          'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
        danger: 'bg-red-700 text-white hover:bg-red-800',
        ghost: 'text-slate-700 hover:bg-slate-100',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);

export function Button({
  className,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}) {
  return <button className={cn(styles({ variant }), className)} {...props} />;
}
