import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Loader2, Inbox, FileText, Send, MessageSquare, Mic, MicOff, Trash2 } from 'lucide-react';
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
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [triageQuery, setTriageQuery] = useState('in:inbox newer_than:7d');
  const [summaryQuery, setSummaryQuery] = useState('in:inbox newer_than:14d');
  const [isTriageLoading, setIsTriageLoading] = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const recognitionRef = useRef(null);

  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const userId = useAuthStore((s) => s.userId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const sessions = useAuthStore((s) => s.sessions) || [];
  const activeSessionId = useAuthStore((s) => s.activeSessionId);
  const activeSession = sessions.find(s => s.id === activeSessionId) || null;
  const chatHistory = activeSession ? activeSession.messages : [];
  const sessionId = activeSessionId;

  const addMessage = useAuthStore((s) => s.addMessage);
  const createNewSession = useAuthStore((s) => s.createNewSession);
  const setActiveSession = useAuthStore((s) => s.setActiveSession);
  const updateSessionId = useAuthStore((s) => s.updateSessionId);

  const logout = useAuthStore((s) => s.logout);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);

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
        const score = item?.urgency_score != null ? ` (${item.urgency_score})` : '';
        const subject = item?.subject || '(no subject)';
        const from = item?.from ? ` — ${item.from}` : '';
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
    const overall = result?.overall_actions || [];
    const sections = summaries.slice(0, 4).map((thread, idx) => {
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
      const response = await chatService.runAgent(userId, inputValue.trim(), sessionId || "");
      if (response.session_id && response.session_id !== sessionId) {
        updateSessionId(sessionId, response.session_id);
      }
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

  /* ─── Voice-to-text ────────────────────────────────────── */
  const handleVoiceToggle = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setVoiceError('Speech Recognition is not supported in this browser.');
      setTimeout(() => setVoiceError(''), 3000);
      return;
    }

    if (isRecording) {
      // Stop recording → auto-submit handled by onend below
      recognitionRef.current?.stop();
      return;
    }

    setVoiceError('');
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsRecording(true);

    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript.trim();
      if (!transcript) return;
      // Populate input briefly, then auto-send
      setInputValue(transcript);
      setIsRecording(false);
      // Send directly
      const userMessage = { text: transcript, isUser: true, id: Date.now() };
      addMessage(userMessage);
      setInputValue('');
      setIsSending(true);
      try {
        const response = await chatService.runAgent(userId, transcript, sessionId || '');
        if (response.session_id && response.session_id !== sessionId) {
          updateSessionId(sessionId, response.session_id);
        }
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

    recognition.onerror = (event) => {
      setIsRecording(false);
      if (event.error !== 'aborted') {
        setVoiceError(`Mic error: ${event.error}`);
        setTimeout(() => setVoiceError(''), 3000);
      }
    };

    recognition.onend = () => setIsRecording(false);

    recognition.start();
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
        <div className="flex items-center gap-2.5 px-5 py-6">
          <div className="h-7 w-7 rounded-lg overflow-hidden shrink-0">
            <img src="/bot.png" alt="Agent47 Logo" className="h-full w-full object-cover" />
          </div>
          <span className="text-[15px] font-bold text-white tracking-tight">Agent47</span>
        </div>

        {/* User Card */}
        <div className="px-4 mb-3">
          <div className="bg-bg-card border border-border mt-1 rounded-[14px] px-3 py-2.5 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full overflow-hidden shrink-0 border border-border">
              <img src="/user.png" alt="User" className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-[12px] text-white font-medium truncate" title={userId}>{userId}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" style={{ boxShadow: '0 0 6px #3b82f6' }} />
                <span className="text-[10px] text-ink-secondary leading-none mt-px">Connected</span>
              </div>
            </div>
          </div>
        </div>

        {/* New Chat Button */}
        <div className="px-4 mb-5">
          <button
            onClick={createNewSession}
            className="w-full bg-accent text-white py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-accent-dim transition-colors"
          >
            <span className="text-xl leading-none font-normal" style={{ marginTop: '-2px' }}>+</span> New Chat
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 space-y-6">

          <SideSection label="RECENT CHATS">
            <div className="space-y-1">
              {sessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => setActiveSession(s.id)}
                  className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-colors text-[13px] ${s.id === activeSessionId ? 'bg-bg-card border border-border text-white font-medium' : 'text-ink-secondary hover:bg-bg-card hover:text-white border border-transparent'}`}
                >
                  <MessageSquare className={`w-4 h-4 shrink-0 ${s.id === activeSessionId ? 'text-accent' : ''}`} />
                  <span className="truncate flex-1">{s.title || 'New Chat'}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); useAuthStore.getState().deleteSession(s.id); }}
                    className="ml-auto opacity-0 group-hover:opacity-100 text-ink-muted hover:text-red-400 transition-all duration-150 p-0.5 rounded cursor-pointer shrink-0"
                    title="Delete chat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {sessions.length === 0 && (
                <div className="px-3 py-2.5 text-xs text-ink-muted">No recent chats</div>
              )}
            </div>
          </SideSection>

          {/* Gmail tools hidden by default under details so it doesnt clutter the UI */}
          <details className="group pb-4">
            <summary className="text-[10px] uppercase tracking-widest text-ink-muted font-semibold px-0.5 mb-1.5 cursor-pointer hover:text-ink-secondary transition-colors list-none flex items-center justify-between">
              GMAIL TOOLS
            </summary>
            <div className="space-y-2 mt-2">
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
          </details>

        </div>

        {/* Sign out */}
        <div className="p-4 mt-2">
          <Button
            variant="ghost"
            className="w-full justify-start text-[13px] gap-2.5 text-ink-secondary hover:text-white px-2 hover:bg-transparent"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* ── Main Panel ──────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full min-w-0">

        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-bg-surface">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg overflow-hidden shrink-0">
              <img src="/bot.png" alt="Agent47 Logo" className="h-full w-full object-cover" />
            </div>
            <span className="text-sm font-semibold">Agent47</span>
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
            <div className="h-full flex flex-col items-center justify-center text-center px-4 animate-fade-in-up pb-[10vh]">
              <div className="h-[68px] w-[68px] rounded-full mb-6 overflow-hidden flex items-center justify-center bg-[#00d4d4]">
                <img src="/bot.png" alt="Agent47 Logo" className="h-full w-full object-cover" />
              </div>
              <h2 className="text-[26px] font-bold text-white mb-2 tracking-tight">
                How can I help you today?
              </h2>
              <p className="text-[15px] text-ink-secondary max-w-[420px] leading-relaxed">
                I'm Agent47, your Google Workspace assistant. I can help manage your calendar, draft emails, and access your documents.
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
        <div className="px-4 md:px-8 pb-8 pt-2 bg-transparent">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSend} className="relative flex items-center w-full">
              <div className="flex-1 flex items-center bg-bg-card rounded-2xl border border-border h-[64px] pl-6 pr-2 focus-within:border-accent/50 shadow-sm transition-colors">
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={isRecording ? 'Listening…' : 'Ask me anything...'}
                  className="flex-1 bg-transparent border-none focus:outline-none text-white text-[15px] placeholder:text-ink-secondary/70 h-full w-full"
                  disabled={isSending}
                />
                {/* Mic button */}
                <button
                  type="button"
                  onClick={handleVoiceToggle}
                  disabled={isSending}
                  title={isRecording ? 'Stop recording & send' : 'Start voice input'}
                  className={[
                    "h-10 w-10 shrink-0 flex items-center justify-center rounded-xl mr-1",
                    "transition-all duration-200 bg-transparent cursor-pointer border-none outline-none",
                    isRecording
                      ? "text-red-400 animate-pulse"
                      : "text-ink-secondary hover:text-accent hover:scale-105 active:scale-95",
                    "disabled:opacity-30 disabled:pointer-events-none",
                  ].join(' ')}
                >
                  {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
                {/* Send button */}
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isSending}
                  className="send-btn"
                >
                  {isSending ? (
                    <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#3b82f6' }} />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </button>
              </div>
            </form>
            {voiceError && (
              <p className="text-center mt-2 text-[11px] text-red-400 leading-tight">{voiceError}</p>
            )}
            <p className="text-center mt-3 text-[11px] text-ink-muted leading-tight">
              Agent47 can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
