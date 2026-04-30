import React from 'react';
import { cn } from '../lib/utils';
import { Loader2 } from 'lucide-react';

export function Button({ className, variant = 'primary', size = 'default', isLoading, children, disabled, ...props }) {
  const base = [
    "inline-flex items-center justify-center font-normal tracking-apple",
    "transition-all duration-200 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-2",
    "disabled:opacity-48 disabled:pointer-events-none",
    "select-none",
  ].join(' ');

  const variants = {
    primary: [
      "bg-primary text-white font-normal",
      "hover:bg-primary-focus",
      "active:scale-[0.95]",
      "rounded-full",
    ].join(' '),

    'secondary-pill': [
      "bg-transparent text-primary border border-primary",
      "hover:bg-primary/5",
      "active:scale-[0.95]",
      "rounded-full",
    ].join(' '),

    'dark-utility': [
      "bg-ink text-white text-[14px]",
      "hover:bg-ink-muted-80",
      "active:scale-[0.95]",
      "rounded-[8px]",
    ].join(' '),

    ghost: [
      "bg-transparent text-ink",
      "hover:bg-canvas-parchment",
      "active:scale-[0.95]",
      "rounded-full",
    ].join(' '),

    outline: [
      "bg-transparent text-ink border border-hairline",
      "hover:bg-canvas-parchment",
      "active:scale-[0.95]",
      "rounded-full",
    ].join(' '),
  };

  const sizes = {
    default: "py-[11px] px-[22px] text-[17px]",
    sm:      "py-[8px] px-[15px] text-[14px]",
    lg:      "py-[14px] px-[28px] text-[18px] font-light", /* Store hero CTA uses weight 300 */
    icon:    "h-10 w-10",
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
