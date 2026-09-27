import React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...values) => twMerge(clsx(values));

const buttonStyles = cva('inline-flex select-none items-center justify-center gap-2 rounded-xl text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 disabled:pointer-events-none disabled:opacity-45 active:scale-[.98]', {
  variants: {
    variant: {
      primary: 'casino-primary-button border-0 bg-[#4d8ee7] text-white hover:bg-[#619df0]',
      secondary: 'border border-white/10 bg-white/[.06] text-white hover:border-white/20 hover:bg-white/[.1]',
      ghost: 'bg-transparent text-white/65 hover:bg-white/[.06] hover:text-white',
      danger: 'border border-rose-400/20 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15',
    },
    size: {
      default: 'h-11 px-4',
      sm: 'h-9 px-3 text-xs',
      icon: 'size-10 p-0',
      wide: 'h-12 w-full px-5',
    },
  },
  defaultVariants: { variant: 'secondary', size: 'default' },
});

export const Button = React.forwardRef(function Button({ className, variant, size, type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={cn(buttonStyles({ variant, size }), className)} {...props} />;
});

export function Card({ className, ...props }) {
  return <section className={cn('rounded-2xl border border-white/[.075] bg-[#171b1c] shadow-[0_22px_70px_rgba(0,0,0,.22)]', className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex items-start justify-between gap-4 p-5 sm:p-6', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h2 className={cn('text-base font-semibold tracking-tight text-white', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-xs leading-5 text-white/45', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('px-5 pb-5 sm:px-6 sm:pb-6', className)} {...props} />;
}

export function Tabs({ ...props }) { return <TabsPrimitive.Root {...props} />; }
export function TabsList({ className, ...props }) {
  return <TabsPrimitive.List className={cn('inline-flex max-w-full items-center gap-1 rounded-xl border border-white/[.07] bg-[#111516] p-1', className)} {...props} />;
}
export function TabsTrigger({ className, ...props }) {
  return <TabsPrimitive.Trigger className={cn('inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-white/45 transition duration-200 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 data-[state=active]:bg-[#273b34] data-[state=active]:text-emerald-200 sm:px-4', className)} {...props} />;
}
export function TabsContent({ className, ...props }) {
  return <TabsPrimitive.Content className={cn('mt-5 outline-none sm:mt-6', className)} {...props} />;
}

export function Toggle({ checked, onCheckedChange, label, ariaLabel }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-xs font-medium text-white/55">
      <span>{label}</span>
      <SwitchPrimitive.Root checked={checked} onCheckedChange={onCheckedChange} aria-label={ariaLabel} className="relative h-6 w-10 rounded-full border border-white/10 bg-white/10 transition data-[state=checked]:border-emerald-300/35 data-[state=checked]:bg-emerald-400/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70">
        <SwitchPrimitive.Thumb className="block size-4 translate-x-1 rounded-full bg-white/70 shadow-sm transition data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-emerald-100" />
      </SwitchPrimitive.Root>
    </label>
  );
}
