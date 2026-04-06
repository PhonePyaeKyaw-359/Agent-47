import React from 'react';
import { cn } from '../lib/utils';

export function ChatBubble({ message, isUser, isError }) {
  return (
    <div className={cn(
      "flex w-full mb-5 animate-fade-in-up",
      isUser ? "justify-end" : "justify-start"
    )}>

      {/* AI Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center mr-3 mt-0.5">
          <span className="text-accent font-semibold text-xs tracking-wider">AI</span>
        </div>
      )}

      {/* Bubble */}
      <div className={cn(
        "max-w-[78%] md:max-w-[68%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap font-normal",
        isUser
          ? "bg-accent text-[#07080d] font-medium rounded-tr-sm"
          : isError
            ? "bg-red-950/40 text-red-300 border border-red-900/40 rounded-tl-sm"
            : "bg-bg-card text-ink-primary border border-border rounded-tl-sm"
      )}>
        {message}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center ml-3 mt-0.5">
          <span className="text-accent font-semibold text-xs">U</span>
        </div>
      )}
    </div>
  );
}
