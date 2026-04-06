import React, { forwardRef } from 'react';
import { cn } from '../lib/utils';

export const Input = forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        // Layout
        "flex h-10 w-full px-4 py-2",
        // Appearance
        "rounded-xl border border-border bg-bg-surface",
        "text-sm text-ink-primary",
        "placeholder:text-ink-muted",
        // Focus
        "focus-visible:outline-none focus-visible:border-accent/50 focus-visible:shadow-glow-sm",
        // States
        "disabled:cursor-not-allowed disabled:opacity-40",
        "transition-all duration-200",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});

Input.displayName = 'Input';
