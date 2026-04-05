import React from 'react';
import { cn } from '../lib/utils';

export function ChatBubble({ message, isUser }) {
  return (
    <div className={cn("flex w-full mb-6", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center mr-3 shadow-sm border border-slate-700">
           <span className="text-slate-300 font-bold text-sm">AI</span>
        </div>
      )}
      
      <div className={cn(
        "max-w-[80%] md:max-w-[70%] rounded-2xl px-5 py-3.5 shadow-sm text-[15px] leading-relaxed",
        isUser 
          ? "bg-blue-700 text-white rounded-tr-sm" 
          : "bg-slate-900 text-slate-200 border border-slate-800 rounded-tl-sm shadow-md"
      )}>
        {message}
      </div>

      {isUser && (
        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-900 flex items-center justify-center ml-3 shadow-sm border border-blue-800">
           <span className="text-blue-200 font-bold text-sm">U</span>
        </div>
      )}
    </div>
  );
}
