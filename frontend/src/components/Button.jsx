import React from 'react';
import { cn } from '../lib/utils';
import { Loader2 } from 'lucide-react';

export function Button({ className, variant = 'primary', size = 'default', isLoading, children, disabled, ...props }) {
  const base = [
    "inline-flex items-center justify-center font-medium tracking-wide",
    "transition-all duration-200 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07080d]",
    "disabled:opacity-40 disabled:pointer-events-none",
    "select-none",
  ].join(' ');

  const variants = {
    primary: [
      "bg-accent text-[#07080d] font-semibold",
      "hover:bg-[#9aa3fb] hover:shadow-glow",
      "active:scale-[0.98]",
      "rounded-xl",
    ].join(' '),

    ghost: [
      "bg-transparent text-ink-secondary",
      "hover:text-ink-primary hover:bg-[#1c1f2e]",
      "rounded-xl",
    ].join(' '),

    outline: [
      "bg-transparent text-ink-secondary border border-border",
      "hover:border-border-accent hover:text-ink-primary",
      "rounded-xl",
    ].join(' '),

    danger: [
      "bg-transparent text-red-400 border border-red-900/50",
      "hover:bg-red-950/40 hover:text-red-300",
      "rounded-xl",
    ].join(' '),
  };

  const sizes = {
    default: "h-10 px-5 text-sm",
    sm:      "h-8 px-4 text-xs",
    lg:      "h-12 px-7 text-base",
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
