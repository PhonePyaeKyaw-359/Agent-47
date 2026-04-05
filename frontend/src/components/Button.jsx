import React from 'react';
import { cn } from '../lib/utils';
import { Loader2 } from 'lucide-react';

export function Button({ className, variant = 'primary', isLoading, children, disabled, ...props }) {
  const baseStyles = "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
  
  const variants = {
    primary: "bg-blue-700 text-white hover:bg-blue-800 shadow-md",
    secondary: "bg-blue-900 text-white hover:bg-slate-800 shadow-md",
    outline: "border-2 border-slate-700 bg-transparent hover:bg-slate-800 text-slate-200",
    ghost: "bg-transparent hover:bg-slate-800 text-slate-200",
  };

  const sizes = {
    default: "h-11 px-6 py-2",
    sm: "h-9 px-4 text-sm",
    lg: "h-14 px-8 text-lg",
    icon: "h-11 w-11",
  };

  return (
    <button 
      className={cn(baseStyles, variants[variant], sizes['default'], className)} 
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
      {children}
    </button>
  );
}
