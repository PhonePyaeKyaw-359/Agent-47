import React, { forwardRef } from 'react';
import { cn } from '../lib/utils';

export const Input = forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        // Layout
        "flex h-[44px] w-full px-[20px] py-[12px]",
        // Appearance
        "rounded-full border border-black/10 bg-canvas",
        "text-[17px] font-normal text-ink",
        "placeholder:text-ink-muted-48",
        // Focus
        "focus-visible:outline-none focus-visible:border-primary-focus focus-visible:ring-2 focus-visible:ring-primary-focus focus-visible:ring-offset-0",
        // States
        "disabled:cursor-not-allowed disabled:opacity-48",
        "transition-all duration-200",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});

Input.displayName = 'Input';
