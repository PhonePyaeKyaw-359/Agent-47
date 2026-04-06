import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Loader2, Inbox, FileText, Send, Zap } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { chatService, authService, gmailService } from '../services/api';
import { ChatBubble } from '../components/ChatBubble';
import { Button } from '../components/Button';
import { Input } from '../components/Input';

/* ─── Sidebar Section wrapper ───────────────────────────────────── */
function SideSection({ label, children }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-widest text-ink-muted font-semibold px-0.5">
        {label}
      </p>
      {children}
    </div>
  );
}

/* ─── Toolbar card in sidebar ───────────────────────────────────── */
function ToolCard({ label, queryValue, onQueryChange, onRun, isRunning, isDisabled, icon: Icon, btnLabel }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-3 space-y-2">
      <label className="text-[11px] text-ink-secondary font-medium">{label}</label>
      <Input
        value={queryValue}
        onChange={onQueryChange}
        className="h-8 text-xs font-mono"
        disabled={isDisabled}
      />
      <Button
        onClick={onRun}
        isLoading={isRunning}
        disabled={isDisabled}
        className="w-full h-8 text-xs gap-1.5"
      >
        <Icon className="h-3.5 w-3.5" />
        {btnLabel}
      </Button>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────── */
export default function Chat() {
  const [inputValue, setInputValue]         = useState('');
  const [isSending, setIsSending]           = useState(false);
  const [triageQuery, setTriageQuery]       = useState('in:inbox newer_than:7d');
  const [summaryQuery, setSummaryQuery]     = useState('in:inbox newer_than:14d');
  const [isTriageLoading, setIsTriageLoading]   = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);

  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  const userId          = useAuthStore((s) => s.userId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const chatHistory     = useAuthStore((s) => s.chatHistory);
  const sessionId       = useAuthStore((s) => s.sessionId);
  const addMessage      = useAuthStore((s) => s.addMessage);
  const logout          = useAuthStore((s) => s.logout);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const setSessionId    = useAuthStore((s) => s.setSessionId);

  /* Auth guard */
  useEffect(() => {
    if (!userId) { navigate('/'); return; }
    const checkAuth = async () => {
      try {
        const data = await authService.checkStatus(userId);
        if (!data || data.authenticated !== true) { setAuthenticated(false); navigate('/'); }
        else setAuthenticated(true);
      } catch { setAuthenticated(false); navigate('/'); }
    };
    if (!isAuthenticated) checkAuth();
  }, [userId, isAuthenticated, navigate, setAuthenticated]);

  /* Auto-scroll */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isSending]);

  /* Auto-focus */
  useEffect(() => { inputRef.current?.focus(); }, [isSending]);

  /* ─── Helpers ──────────────────────────────────────────── */
  const formatTriageResult = (result) => {
    const triage = result?.triage || {};
    const totals = result?.totals || {};
    const renderBucket = (name) => {
      const items = triage[name] || [];
      if (!items.length) return `${name}: none`;
      return [`${name}:`, ...items.slice(0, 6).map((item) => {
        const score   = item?.urgency_score != null ? ` (${item.urgency_score})` : '';
        const subject = item?.subject || '(no subject)';
        const from    = item?.from ? ` — ${item.from}` : '';
        return `  • ${subject}${score}${from}`;
      })].join('\n');
    };
    return [
      '✦ Inbox triage complete.',
      `Analyzed: ${totals.analyzed ?? 'n/a'} · urgent: ${totals.urgent ?? 0} · actionable: ${totals.actionable ?? 0} · fyi: ${totals.fyi ?? 0} · can-wait: ${totals['can-wait'] ?? 0}`,
      '', renderBucket('urgent'),
      '', renderBucket('actionable'),
      '', renderBucket('fyi'),
      '', renderBucket('can-wait'),
      result?.notes ? `\nNotes: ${result.notes}` : '',
    ].join('\n');
  };

  const formatSummaryResult = (result) => {
    const summaries = result?.summaries || [];
    const overall   = result?.overall_actions || [];
    const sections  = summaries.slice(0, 4).map((thread, idx) => {
      const lines = (arr, limit = 3) => (arr || []).slice(0, limit).map((x) => `    • ${x}`).join('\n') || '    • none';
      return [
        `${idx + 1}. ${thread?.subject || '(no subject)'}`,
        `   Thread: ${thread?.thread_id || 'unknown'}`,
        `   Key facts:\n${lines(thread?.key_facts)}`,
        `   Decisions:\n${lines(thread?.decisions)}`,
        `   Open questions:\n${lines(thread?.open_questions)}`,
        `   Next steps:\n${lines(thread?.next_steps_for_me)}`,
        `   Waiting on:\n${lines(thread?.waiting_on_others)}`,
      ].join('\n');
    });
    const overallSection = overall.length
      ? ['Overall actions:', ...overall.slice(0, 6).map((x) => `  • ${x}`)].join('\n')
      : 'Overall actions: none';
    return [`✦ Thread summary complete (${summaries.length} thread(s)).`, '', ...sections, '', overallSection].join('\n');
  };

  /* ─── Handlers ─────────────────────────────────────────── */
  const handleSend = async (e) => {
    e?.preventDefault();
    if (!inputValue.trim() || isSending) return;
    const userMessage = { text: inputValue, isUser: true, id: Date.now() };
    addMessage(userMessage);
    setInputValue('');
    setIsSending(true);
    try {
      const response = await chatService.runAgent(userId, inputValue.trim(), sessionId);
      if (response.session_id) setSessionId(response.session_id);
      addMessage({ text: response.response, isUser: false, id: Date.now() + 1 });
    } catch (error) {
      addMessage({
        text: `Error: ${error.response?.data?.message || error.message}`,
        isUser: false, id: Date.now() + 1, isError: true,
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleInboxTriage = async () => {
    if (!userId || isTriageLoading || isSummaryLoading || isSending) return;
    setIsTriageLoading(true);
    addMessage({ text: `↳ Smart Inbox Triage (${triageQuery})`, isUser: true, id: Date.now() });
    try {
      const result = await gmailService.triageInbox(userId, triageQuery, 25, true);
      addMessage({ text: formatTriageResult(result), isUser: false, id: Date.now() + 1 });
    } catch (error) {
      addMessage({ text: `Triage failed: ${error.response?.data?.detail?.message || error.message}`, isUser: false, id: Date.now() + 1, isError: true });
    } finally { setIsTriageLoading(false); }
  };

  const handleSummarize = async () => {
    if (!userId || isSummaryLoading || isTriageLoading || isSending) return;
    setIsSummaryLoading(true);
    addMessage({ text: `↳ Email Summarizer + Actions (${summaryQuery})`, isUser: true, id: Date.now() });
    try {
      const result = await gmailService.summarizeThreads(userId, summaryQuery, 5);
      addMessage({ text: formatSummaryResult(result), isUser: false, id: Date.now() + 1 });
    } catch (error) {
      addMessage({ text: `Summarization failed: ${error.response?.data?.detail?.message || error.message}`, isUser: false, id: Date.now() + 1, isError: true });
    } finally { setIsSummaryLoading(false); }
  };

  const handleLogout = () => { logout(); navigate('/'); };

  /* Auth pending */
  if (!isAuthenticated && userId) {
    return (
      <div className="flex h-screen w-full items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
        <span className="text-sm text-ink-secondary">Verifying authentication…</span>
      </div>
    );
  }

  const busy = isTriageLoading || isSummaryLoading || isSending;

  return (
    <div className="flex h-screen overflow-hidden text-ink-primary">

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="hidden md:flex w-64 flex-col bg-bg-surface border-r border-border shrink-0">

        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
          <div className="h-7 w-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <Zap className="h-3.5 w-3.5 text-accent" />
          </div>
          <span className="text-sm font-semibold text-ink-primary tracking-tight">Workspace AI</span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">

          {/* Session */}
          <SideSection label="Session">
            <div className="bg-bg-card border border-border rounded-xl px-3 py-2.5 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
              <p className="text-xs text-ink-secondary truncate" title={userId}>{userId}</p>
            </div>
          </SideSection>

          {/* Gmail tools */}
          <SideSection label="Gmail Tools">
            <div className="space-y-2">
              <ToolCard
                label="Triage Query"
                queryValue={triageQuery}
                onQueryChange={(e) => setTriageQuery(e.target.value)}
                onRun={handleInboxTriage}
                isRunning={isTriageLoading}
                isDisabled={isSummaryLoading || isSending}
                icon={Inbox}
                btnLabel="Smart Triage"
              />
              <ToolCard
                label="Summary Query"
                queryValue={summaryQuery}
                onQueryChange={(e) => setSummaryQuery(e.target.value)}
                onRun={handleSummarize}
                isRunning={isSummaryLoading}
                isDisabled={isTriageLoading || isSending}
                icon={FileText}
                btnLabel="Summarize"
              />
            </div>
          </SideSection>
        </div>

        {/* Sign out */}
        <div className="px-3 py-3 border-t border-border">
          <Button
            variant="ghost"
            className="w-full justify-start text-xs gap-2 text-ink-secondary"
            onClick={handleLogout}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* ── Main Panel ──────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full min-w-0">

        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-bg-surface">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-accent" />
            </div>
            <span className="text-sm font-semibold">Workspace AI</span>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 text-ink-secondary hover:text-ink-primary transition-colors rounded-lg hover:bg-bg-card"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          {chatHistory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 animate-fade-in-up">
              <div className="h-14 w-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-5">
                <Zap className="h-6 w-6 text-accent" />
              </div>
              <h2 className="text-lg font-semibold text-ink-primary mb-1">
                How can I help you today?
              </h2>
              <p className="text-sm text-ink-secondary max-w-xs">
                Your Google Workspace AI assistant. Manage calendar, draft emails, and access documents.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto pb-4">
              {chatHistory.map((msg) => (
                <ChatBubble
                  key={msg.id}
                  message={msg.text}
                  isUser={msg.isUser}
                  isError={msg.isError}
                />
              ))}

              {/* Typing indicator */}
              {isSending && (
                <div className="flex items-start gap-3 mb-5 animate-fade-in-up">
                  <div className="h-8 w-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                    <span className="text-accent font-semibold text-xs">AI</span>
                  </div>
                  <div className="bg-bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="px-4 md:px-8 py-4 border-t border-border bg-bg-base/60 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSend} className="relative flex items-center gap-2">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask me anything…"
                className="flex-1 h-11 text-sm"
                disabled={isSending}
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isSending}
                className={[
                  "h-11 w-11 shrink-0 rounded-xl flex items-center justify-center",
                  "bg-accent text-bg-base transition-all duration-200",
                  "hover:opacity-90 hover:shadow-glow-sm active:scale-95",
                  "disabled:opacity-30 disabled:pointer-events-none",
                ].join(' ')}
              >
                {isSending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4" />
                }
              </button>
            </form>
            <p className="text-center mt-2 text-[11px] text-ink-muted">
              Workspace AI can make mistakes — always verify important information.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
