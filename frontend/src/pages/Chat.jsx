import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Loader2, Inbox, FileText, Send, MessageSquare, Mic, MicOff, Trash2, Mail, Calendar, FilePlus } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { chatService, authService, gmailService, WS_BASE_URL } from '../services/api';
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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const recognitionRef = useRef(null); // holds MediaRecorder instance
  const wsRef = useRef(null);          // holds WebSocket for streaming STT

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

  /* Auto-resize textarea when value changes (e.g. from card click) */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [inputValue]);

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

  /* ─── Voice-to-text (Google Cloud Speech-to-Text, WebSocket) ── */
  const handleVoiceToggle = async () => {
    // Stop if already recording
    if (isRecording) {
      recognitionRef.current?.stop(); // onstop → sends DONE over WebSocket
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('Microphone access is not supported in this browser.');
      setTimeout(() => setVoiceError(''), 3000);
      return;
    }

    setVoiceError('');

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setVoiceError('Microphone permission denied.');
      setTimeout(() => setVoiceError(''), 3000);
      return;
    }

    const ws = new WebSocket(`${WS_BASE_URL}/ws/speech`);
    wsRef.current = ws;

    let lastTranscript = '';

    ws.onmessage = async (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }

      if (data.type === 'error') {
        setIsTranscribing(false);
        setVoiceError(`Speech error: ${data.message}`);
        setTimeout(() => setVoiceError(''), 5000);
        ws.close();
        return;
      }

      if (data.type === 'final') {
        lastTranscript = (data.transcript || '').trim();
        setInputValue(lastTranscript);
      } else if (data.type === 'done') {
        setIsTranscribing(false);
        ws.close();
        if (!lastTranscript) {
          setInputValue('');
          setVoiceError('No speech detected. Please try again.');
          setTimeout(() => setVoiceError(''), 3000);
          return;
        }
        // Auto-send
        const userMessage = { text: lastTranscript, isUser: true, id: Date.now() };
        addMessage(userMessage);
        setInputValue('');
        setIsSending(true);
        try {
          const response = await chatService.runAgent(userId, lastTranscript, sessionId || '');
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
      }
    };

    ws.onerror = () => {
      setIsRecording(false);
      setIsTranscribing(false);
      setVoiceError('WebSocket connection failed. Please try again.');
      setTimeout(() => setVoiceError(''), 3000);
      stream.getTracks().forEach((t) => t.stop());
    };

    ws.onclose = () => setIsRecording(false);

    ws.onopen = () => {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/webm';

      let recorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType });
      } catch {
        setVoiceError('Audio recording not supported in this browser.');
        setTimeout(() => setVoiceError(''), 3000);
        ws.close();
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      recognitionRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
      };
      recorder.onstart = () => setIsRecording(true);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
        setIsTranscribing(true);
        if (ws.readyState === WebSocket.OPEN) ws.send('DONE');
      };
      recorder.onerror = () => {
        setIsRecording(false);
        setIsTranscribing(false);
        setVoiceError('Recording error. Please try again.');
        setTimeout(() => setVoiceError(''), 3000);
        ws.close();
      };

      // Collect 250ms chunks; auto-stop after 30 s
      recorder.start(250);
      setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 30000);
    };
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
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border/40">
          <div className="h-8 w-8 rounded-xl overflow-hidden shrink-0 shadow-glow-sm">
            <img src="/bot.png" alt="Agent47 Logo" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col">
            <span className="text-[14px] font-bold text-white tracking-tight leading-none">Agent47</span>
            <span className="text-[10px] text-ink-muted mt-0.5">Google Workspace AI</span>
          </div>
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
        <div className="px-4 mb-4 mt-4">
          <button
            onClick={createNewSession}
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
          >
            <span className="text-lg leading-none font-light">+</span> New Chat
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
              <div className="relative mb-6">
                <div className="h-20 w-20 rounded-2xl overflow-hidden shadow-glow" style={{ border: '2px solid rgba(59,130,246,0.35)' }}>
                  <img src="/bot.png" alt="Agent47 Logo" className="h-full w-full object-cover" />
                </div>
                <span className="absolute -bottom-1.5 -right-1.5 h-5 w-5 rounded-full bg-accent flex items-center justify-center" style={{ boxShadow: '0 0 10px rgba(59,130,246,0.6)' }}>
                  <span className="h-2 w-2 rounded-full bg-white" />
                </span>
              </div>
              <div className="mb-1 text-[11px] uppercase tracking-widest text-accent font-semibold">Agent47</div>
              <h2 className="text-[28px] font-bold text-white mb-3 tracking-tight">
                How can I help you today?
              </h2>
              <p className="text-[14px] text-ink-secondary max-w-[380px] leading-relaxed mb-8">
                Your Google Workspace AI — emails, calendars, docs, and more.
              </p>

              {/* Quick Action Cards */}
              <div className="flex flex-row gap-3 justify-center w-full max-w-[620px]">
                {[
                  {
                    icon: Mail,
                    label: 'Send an Email',
                    desc: 'Draft and send a professional email',
                    color: '#3b82f6',
                    bg: 'rgba(59,130,246,0.07)',
                    border: 'rgba(59,130,246,0.22)',
                    prompt: `I want to send an email. To?: \n What do you want to send?: \n What is your tone?[1. Normal, 2. Formal, 3. Decorated(HTML)]: \n How can I call you?:`,
                  },
                  {
                    icon: FilePlus,
                    label: 'Create a Document',
                    desc: 'Create a new Google Doc with structure',
                    color: '#a78bfa',
                    bg: 'rgba(167,139,250,0.07)',
                    border: 'rgba(167,139,250,0.22)',
                    prompt: `Create a Google Doc titled "Q2 Planning Notes"\n\nInclude the following sections:\n1. Goals — What we want to achieve this quarter\n2. Timeline — Key milestones and deadlines\n3. Team Responsibilities — Who owns what`,
                  },
                  {
                    icon: Calendar,
                    label: 'Schedule an Event',
                    desc: 'Add a meeting or event to your calendar',
                    color: '#34d399',
                    bg: 'rgba(52,211,153,0.07)',
                    border: 'rgba(52,211,153,0.22)',
                    prompt: `Schedule a team sync meeting next Monday at 10am for 1 hour. Invite the team and add a Google Meet link.`,
                  },
                ].map(({ icon: Icon, label, desc, color, bg, border, prompt }) => (
                  <button
                    key={label}
                    onClick={() => { setInputValue(prompt); setTimeout(() => inputRef.current?.focus(), 0); }}
                    className="quick-action-card flex items-start gap-3 px-4 py-3.5 rounded-2xl text-left transition-all duration-200 cursor-pointer flex-1 min-w-0 overflow-hidden"
                    style={{ background: bg, border: `1px solid ${border}` }}
                  >
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${color}22` }}>
                      <Icon className="h-3.5 w-3.5" style={{ color }} />
                    </div>
                    <div className="flex flex-col min-w-0 overflow-hidden">
                      <span className="text-[12px] font-semibold text-white leading-snug break-words">{label}</span>
                      <span className="text-[11px] mt-0.5 leading-snug break-words" style={{ color: `${color}cc` }}>{desc}</span>
                    </div>
                  </button>
                ))}
              </div>
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
                <div className="flex items-end gap-3 mb-5 animate-fade-in-up">
                  <div className="h-8 w-8 rounded-xl overflow-hidden shrink-0 shadow-glow-sm mb-0.5">
                    <img src="/bot.png" alt="AI" className="h-full w-full object-cover" />
                  </div>
                  <div className="bg-bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5 shadow-card">
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
        <div className="px-4 md:px-8 pb-6 pt-2 bg-transparent">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSend} className="relative flex items-center w-full">
              <div className="flex-1 flex items-start bg-bg-card rounded-2xl border border-border pl-6 pr-2 pt-[16px] pb-[16px] focus-within:border-accent/60 focus-within:shadow-glow-sm shadow-card transition-all duration-200 min-h-[60px]"
                style={{ backdropFilter: 'blur(8px)' }}>
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}
                  placeholder={isRecording ? 'Listening…' : isTranscribing ? 'Transcribing…' : 'Ask me anything...'}
                  rows={1}
                  className="flex-1 bg-transparent border-none focus:outline-none text-white text-[15px] placeholder:text-ink-secondary/70 w-full resize-none overflow-y-auto leading-relaxed"
                  style={{ minHeight: '28px', maxHeight: '180px' }}
                  disabled={isSending}
                />
                {/* Mic button */}
                <button
                  type="button"
                  onClick={handleVoiceToggle}
                  disabled={isSending}
                  title={isRecording ? 'Stop recording & send' : 'Start voice input'}
                  className={[
                    "h-9 w-9 shrink-0 flex items-center justify-center rounded-xl mr-1",
                    "transition-all duration-200 bg-transparent cursor-pointer border-none outline-none",
                    isRecording
                      ? "text-red-400 mic-recording"
                      : "text-ink-secondary hover:text-accent hover:bg-white/5",
                    "disabled:opacity-30 disabled:pointer-events-none",
                  ].join(' ')}
                >
                  {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
                {/* Send button */}
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isSending}
                  title="Send message"
                  className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl mr-1 transition-all duration-200 disabled:opacity-30 disabled:pointer-events-none active:scale-90 cursor-pointer"
                  style={{
                    background: (!inputValue.trim() || isSending) ? 'transparent' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                    border: 'none',
                    outline: 'none',
                  }}
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  ) : (
                    <Send className="h-4 w-4" style={{ color: inputValue.trim() ? '#ffffff' : '#60a5fa' }} />
                  )}
                </button>
              </div>
            </form>
            {voiceError && (
              <p className="text-center mt-2 text-[11px] text-red-400 leading-tight">{voiceError}</p>
            )}
            <p className="text-center mt-2.5 text-[10px] text-ink-muted/60 leading-tight">
              Agent47 may make mistakes. Always verify important information.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
