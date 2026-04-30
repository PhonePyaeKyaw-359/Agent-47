import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';
import { IntentBlockRenderer } from './IntentBlockRenderer';
import { Bot, ChevronDown, ChevronRight, Zap, CheckCircle2, XCircle } from 'lucide-react';

/* Markdown component overrides */
const mdComponents = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline underline-offset-2 break-all font-medium"
    >
      {children}
    </a>
  ),
  p: ({ children }) => <p className="mb-3 last:mb-0 leading-[1.53] text-[15px] tracking-[-0.01em]">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-1.5 text-[15px] tracking-[-0.01em] leading-[1.53]">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-1.5 text-[15px] tracking-[-0.01em] leading-[1.53]">{children}</ol>,
  li: ({ children }) => <li className="leading-[1.53] pl-1 tracking-[-0.01em]">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic opacity-90">{children}</em>,
  code: ({ inline, children }) =>
    inline
      ? <code className="bg-canvas-parchment/70 px-1.5 py-0.5 rounded-[5px] text-[13px] font-mono text-ink-muted-80 border border-hairline">{children}</code>
      : <pre className="bg-canvas-parchment border border-hairline rounded-[12px] p-4 overflow-x-auto text-[13px] font-mono text-ink mb-4 leading-relaxed"><code>{children}</code></pre>,
  h1: ({ children }) => <h1 className="text-[22px] font-semibold text-ink mb-2.5 mt-4 tracking-[-0.015em] font-display leading-[1.18]">{children}</h1>,
  h2: ({ children }) => <h2 className="text-[18px] font-semibold text-ink mb-2 mt-3.5 tracking-[-0.01em] font-display leading-[1.22]">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[15px] font-semibold text-ink mb-1.5 mt-3 tracking-[-0.01em] font-display leading-[1.27]">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-[3px] border-primary/30 pl-4 py-1 my-3 text-ink-muted-80 italic bg-canvas-parchment/40 rounded-r-[8px]">{children}</blockquote>
  ),
  hr: () => <hr className="border-hairline my-4" />,
};

/* ── Collapsible steps disclosure ─────────────────────────────── */
function AgentSteps({ steps }) {
  const [open, setOpen] = useState(false);
  if (!steps || steps.length === 0) return null;

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-muted-48 hover:text-ink-muted-80 transition-colors cursor-pointer bg-transparent border-none outline-none p-0"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <Zap className="w-3 h-3" />
        <span>{steps.length} step{steps.length > 1 ? 's' : ''} executed</span>
      </button>

      {open && (
        <div className="mt-2 ml-1 space-y-1 bg-canvas-parchment/60 border border-hairline rounded-[10px] p-3 text-[12px] font-mono animate-fade-in-up">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-2 text-ink-muted-80">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-[6px]" />
              <span className="font-mono leading-relaxed break-all">{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


/* ── Try to extract structured action result from message text ──── */
function parseActionResult(text) {
  if (!text) return null;

  // Pattern: some human text + Response/Result: { JSON }
  // or: some human text + ```json { ... } ```
  const patterns = [
    /^([\s\S]*?)(?:Response|Result)\s*:\s*(\{[\s\S]*\})\s*$/i,
    /^([\s\S]*?)(?:Response|Result)\s*:\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i,
    /^([\s\S]*?)```(?:json)?\s*(\{[\s\S]*?\})\s*```\s*$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const humanText = match[1].trim();
      const jsonStr = match[2].trim();
      try {
        const data = JSON.parse(jsonStr);
        if (typeof data === 'object' && data !== null) {
          return { humanText, data };
        }
      } catch { /* not valid json */ }
    }
  }

  return null;
}

/* ── Detect success/failure from message text ──────────────────── */
function detectResultType(text) {
  if (!text) return 'info';
  const lower = text.toLowerCase();
  if (/successfully|success|sent|created|done|completed|scheduled/i.test(lower)) return 'success';
  if (/error|failed|failure|denied|rejected/i.test(lower)) return 'error';
  return 'info';
}

/* ── Clean up backend jargon into user-friendly text ───────────── */
function humanizeText(text) {
  if (!text) return text;
  let cleaned = text
    // Remove tech phrases
    .replace(/\s*directly\s*/gi, ' ')
    .replace(/\s*via\s+(the\s+)?API\s*/gi, ' ')
    .replace(/\s*via\s+(the\s+)?SDK\s*/gi, ' ')
    .replace(/\s*using\s+(the\s+)?API\s*/gi, ' ')
    .replace(/\bAPI\b/g, '')
    .replace(/\bSDK\b/g, '')
    // Trim extra spaces and trailing punctuation cleanup
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([!.])/g, '$1')
    .trim();
  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

/* ── Action Result Card component ──────────────────────────────── */
function ActionResultCard({ humanText }) {
  const resultType = detectResultType(humanText);
  const isSuccess = resultType === 'success';
  const isError = resultType === 'error';
  const displayText = humanizeText(humanText);

  return (
    <div className={cn(
      "inline-flex items-center gap-2 rounded-full px-3.5 py-2 mt-1 animate-fade-in-up text-[14px] font-medium",
      isSuccess ? "bg-emerald-50 text-emerald-700" :
      isError   ? "bg-red-50 text-red-600" :
                  "bg-canvas-parchment text-ink"
    )}>
      {isSuccess ? (
        <CheckCircle2 className="w-4 h-4 shrink-0" />
      ) : isError ? (
        <XCircle className="w-4 h-4 shrink-0" />
      ) : null}
      <span>{displayText}</span>
    </div>
  );
}

export function ChatBubble({ message, isUser, isError, steps, onExecuteIntent }) {
  let parsedMessage = message;
  const intents = [];
  let actionResult = null;
  
  if (!isUser && message) {
    // 1) Extract intent blocks
    const regex = /```json(?:\s*intent)?\s*([\s\S]*?)\s*```/gi;
    parsedMessage = message.replace(regex, (match, jsonString) => {
       try {
          const parsed = JSON.parse(jsonString);
          if (parsed && parsed.intent && parsed.payload) {
             intents.push(parsed);
             return '';
          }
       } catch {
          // keep as is if not valid json
       }
       return match;
    });

    // 2) Try to parse action result (API response JSON embedded in text)
    actionResult = parseActionResult(parsedMessage);
  }

  const hasIntents = intents.length > 0;
  // If we parsed an action result, we'll render the card instead of raw markdown
  const hasActionResult = actionResult !== null;
  const hasTextContent = hasActionResult
    ? false  // the card handles the text
    : parsedMessage && parsedMessage.trim().length > 0;

  return (
    <div className={cn(
      "flex flex-col w-full mb-5 animate-fade-in-up",
      isUser ? "items-end" : "items-start"
    )}>
      {/* ── Main bubble row ─────────────────────────────────────── */}
      {(hasTextContent || hasActionResult || isUser) && (
        <div className={cn(
          "flex w-full items-end",
          isUser ? "justify-end" : "justify-start"
        )}>
          {/* AI Avatar */}
          {!isUser && (
            <div className="flex-shrink-0 h-7 w-7 rounded-full bg-canvas-parchment flex items-center justify-center mr-2.5 mb-1 border border-hairline">
              <Bot className="h-[15px] w-[15px] text-ink-muted-80" />
            </div>
          )}

          {/* Bubble */}
          <div className={cn(
            "max-w-[82%] md:max-w-[72%] text-[15px] font-normal tracking-[-0.01em] leading-[1.53]",
            isUser
              ? "bg-primary text-white rounded-[20px] rounded-br-[6px] px-4.5 py-3 shadow-sm ml-auto"
              : isError
                ? "bg-red-50 text-red-700 border border-red-200/60 rounded-[20px] rounded-bl-[6px] px-4.5 py-3"
                : "text-ink py-1 px-0"
          )}>
            {isUser ? (
              <span className="whitespace-pre-wrap leading-[1.53]">{message}</span>
            ) : hasActionResult ? (
              <>
                <AgentSteps steps={steps} />
                <ActionResultCard humanText={actionResult.humanText} data={actionResult.data} />
              </>
            ) : (
              <>
                <AgentSteps steps={steps} />
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {parsedMessage}
                </ReactMarkdown>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Intent blocks render below, full-width ──────────────── */}
      {hasIntents && (
        <div className={cn(
          "w-full mt-2",
          !isUser && "pl-[38px]"  /* align with the text after the avatar */
        )}>
          {intents.map((intent, idx) => (
            <IntentBlockRenderer key={idx} intentData={intent} onExecute={onExecuteIntent} />
          ))}
        </div>
      )}
    </div>
  );
}
