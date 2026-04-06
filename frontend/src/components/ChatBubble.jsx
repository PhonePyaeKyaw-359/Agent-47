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
        <div className="flex-shrink-0 h-8 w-8 rounded-lg overflow-hidden flex items-center justify-center mr-3 mt-0.5">
          <img src="/bot.png" alt="AI" className="h-full w-full object-cover" />
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
        <div className="flex-shrink-0 h-8 w-8 rounded-lg overflow-hidden flex items-center justify-center ml-3 mt-0.5">
          <img src="/user.png" alt="User" className="h-full w-full object-cover" />
        </div>
      )}
    </div>
  );
}
