import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';

/* Markdown component overrides */
const mdComponents = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline underline-offset-2 hover:text-blue-300 transition-colors break-all"
    >
      {children}
    </a>
  ),
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic opacity-90">{children}</em>,
  code: ({ inline, children }) =>
    inline
      ? <code className="bg-white/10 px-1.5 py-0.5 rounded text-[13px] font-mono text-blue-200">{children}</code>
      : <pre className="bg-[#0a0f1e] border border-border rounded-xl p-3 overflow-x-auto text-[13px] font-mono text-blue-100 mb-2"><code>{children}</code></pre>,
  h1: ({ children }) => <h1 className="text-base font-bold text-white mb-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold text-white mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold text-white mb-1">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent/50 pl-3 text-ink-secondary italic mb-2">{children}</blockquote>
  ),
  hr: () => <hr className="border-border my-2" />,
};

export function ChatBubble({ message, isUser, isError }) {
  return (
    <div className={cn(
      "flex w-full mb-5 animate-fade-in-up items-end",
      isUser ? "justify-end" : "justify-start"
    )}>

      {/* AI Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 h-8 w-8 rounded-xl overflow-hidden flex items-center justify-center mr-3 mb-0.5 shadow-glow-sm">
          <img src="/bot.png" alt="AI" className="h-full w-full object-cover" />
        </div>
      )}

      {/* Bubble */}
      <div className={cn(
        "max-w-[78%] md:max-w-[68%] px-4 py-3 rounded-2xl text-sm font-normal",
        isUser
          ? "bg-accent text-[#07080d] font-medium rounded-br-sm"
          : isError
            ? "bg-red-950/40 text-red-300 border border-red-900/40 rounded-bl-sm"
            : "bg-bg-card text-ink-primary border border-border rounded-bl-sm shadow-card"
      )}>
        {isUser ? (
          <span className="whitespace-pre-wrap leading-relaxed">{message}</span>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {message}
          </ReactMarkdown>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="flex-shrink-0 h-8 w-8 rounded-xl overflow-hidden flex items-center justify-center ml-3 mb-0.5">
          <img src="/user.png" alt="User" className="h-full w-full object-cover" />
        </div>
      )}
    </div>
  );
}
