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
      className="text-accent underline underline-offset-2 hover:opacity-80 transition-opacity break-all"
    >
      {children}
    </a>
  ),
  p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed font-light">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1 font-light">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1 font-light">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-ink-primary">{children}</strong>,
  em: ({ children }) => <em className="italic opacity-90">{children}</em>,
  code: ({ inline, children }) =>
    inline
      ? <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[13px] font-mono text-ink-primary">{children}</code>
      : <pre className="bg-gray-50 border border-border rounded-[14px] p-4 overflow-x-auto text-[13px] font-mono text-ink-primary mb-3 shadow-sm"><code>{children}</code></pre>,
  h1: ({ children }) => <h1 className="text-[16px] font-semibold text-ink-primary mb-1 mt-2 tracking-tight">{children}</h1>,
  h2: ({ children }) => <h2 className="text-[15px] font-semibold text-ink-primary mb-1 mt-2 tracking-tight">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[14px] font-medium text-ink-primary mb-1 mt-2 tracking-tight">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent/50 pl-4 text-ink-secondary italic mb-3 font-light">{children}</blockquote>
  ),
  hr: () => <hr className="border-border my-4" />,
};

export function ChatBubble({ message, isUser, isError, steps }) {
  return (
    <div className={cn(
      "flex w-full mb-6 animate-fade-in-up items-end",
      isUser ? "justify-end" : "justify-start"
    )}>

      {/* AI Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 h-8 w-8 rounded-full overflow-hidden flex items-center justify-center mr-3 mb-1 border border-border bg-white shadow-sm">
          <img src="/bot.png" alt="AI" className="h-[20px] w-[20px] object-cover" />
        </div>
      )}

      {/* Bubble */}
      <div className={cn(
        "max-w-[85%] md:max-w-[75%] px-5 py-3.5 rounded-[22px] text-[15px] font-normal tracking-tight",
        isUser
          ? "bg-accent text-white rounded-br-sm shadow-sm"
          : isError
            ? "bg-red-50 text-red-600 border border-red-200 rounded-bl-sm"
            : "bg-white text-ink-primary border border-border rounded-bl-[4px] shadow-sm"
      )}>
        {isUser ? (
          <span className="whitespace-pre-wrap leading-relaxed">{message}</span>
        ) : (
          <>
            {steps && steps.length > 0 && (
              <div className="mb-3 space-y-1 bg-gray-50 border border-gray-100 rounded-[12px] p-3 text-[12px]">
                <div className="font-semibold text-ink-secondary mb-1">Agent Routing & Actions:</div>
                {steps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-ink-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent/60 shrink-0" />
                    <span className="font-mono">{step}</span>
                  </div>
                ))}
              </div>
            )}
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {message}
            </ReactMarkdown>
          </>
        )}
      </div>
    </div>
  );
}
