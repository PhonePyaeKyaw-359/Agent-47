import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Loader2, Inbox, Send, MessageSquare, Mic, MicOff, Trash2, Mail, Calendar, CreditCard, Wand2, Search, Presentation, ListChecks, FileSpreadsheet } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { chatService, authService, WS_BASE_URL } from '../services/api';
import { ChatBubble } from '../components/ChatBubble';
import { Button } from '../components/Button';

/* ─── Sidebar Section wrapper ───────────────────────────────────── */
function SideSection({ label, children }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-wider text-ink-muted font-medium px-1">
        {label}
      </p>
      {children}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────── */
export default function Chat() {
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const recognitionRef = useRef(null);
  const wsRef = useRef(null);

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

  /* Auto-resize textarea */
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }, [inputValue]);

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

  const handleVoiceToggle = async () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('Microphone access is not supported in this browser.');
      setTimeout(() => setVoiceError(''), 3000);
      return;
    }
    setVoiceError('');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setVoiceError('Microphone permission denied.'); setTimeout(() => setVoiceError(''), 3000); return; }

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
        ws.close(); return;
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
          addMessage({ text: `Error: ${error.response?.data?.message || error.message}`, isUser: false, id: Date.now() + 1, isError: true, });
        } finally { setIsSending(false); }
      }
    };
    ws.onerror = () => {
      setIsRecording(false); setIsTranscribing(false);
      setVoiceError('WebSocket connection failed.'); setTimeout(() => setVoiceError(''), 3000);
      stream.getTracks().forEach((t) => t.stop());
    };
    ws.onclose = () => setIsRecording(false);
    ws.onopen = () => {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : 'audio/webm';
      let recorder;
      try { recorder = new MediaRecorder(stream, { mimeType }); }
      catch { setVoiceError('Audio recording not supported.'); setTimeout(() => setVoiceError(''), 3000); ws.close(); stream.getTracks().forEach((t) => t.stop()); return; }
      recognitionRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data); };
      recorder.onstart = () => setIsRecording(true);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false); setIsTranscribing(true);
        if (ws.readyState === WebSocket.OPEN) ws.send('DONE');
      };
      recorder.onerror = () => {
        setIsRecording(false); setIsTranscribing(false);
        setVoiceError('Recording error.'); setTimeout(() => setVoiceError(''), 3000); ws.close();
      };
      recorder.start(250);
      setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 30000);
    };
  };

  const handleLogout = () => { logout(); navigate('/'); };

  if (!isAuthenticated && userId) {
    return (
      <div className="flex h-screen w-full items-center justify-center gap-3 bg-bg-base font-sans">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
        <span className="text-sm text-ink-secondary tracking-tight">Verifying authentication…</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden text-ink-primary bg-bg-base font-sans">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="hidden md:flex w-64 flex-col bg-bg-surface border-r border-border shrink-0">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
          <div className="h-8 w-8 rounded-[8px] overflow-hidden shrink-0 border border-border shadow-sm">
            <img src="/bot.png" alt="Agent47 Logo" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold text-ink-primary tracking-tight leading-none">Agent47</span>
            <span className="text-[11px] text-ink-muted mt-0.5 tracking-tight">Your best daily companion</span>
          </div>
        </div>

        <div className="px-4 mb-3 mt-4">
          <div className="bg-bg-base border border-border rounded-[14px] px-3 py-2.5 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full overflow-hidden shrink-0 border border-border">
              <img src="/user.png" alt="User" className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-[13px] text-ink-primary font-medium truncate tracking-tight" title={userId}>{userId}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                <span className="text-[11px] text-green-600 leading-none mt-px tracking-tight">Connected</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 mb-4 mt-2">
          <button
            onClick={createNewSession}
            className="w-full py-2.5 rounded-full text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] text-white"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            <span className="text-lg leading-none font-light">+</span> New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-6">
          <SideSection label="Recent Chats">
            <div className="space-y-1">
              {sessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => setActiveSession(s.id)}
                  className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-[12px] cursor-pointer transition-colors text-[14px] tracking-tight ${s.id === activeSessionId ? 'bg-bg-base font-semibold text-ink-primary' : 'text-ink-secondary hover:bg-gray-50 border border-transparent'}`}
                >
                  <MessageSquare className={`w-4 h-4 shrink-0 ${s.id === activeSessionId ? 'text-ink-primary' : 'text-ink-muted'}`} />
                  <span className="truncate flex-1">{s.title || 'New Chat'}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); useAuthStore.getState().deleteSession(s.id); }}
                    className="ml-auto opacity-0 group-hover:opacity-100 text-ink-muted hover:text-red-500 transition-all duration-150 p-0.5 rounded cursor-pointer shrink-0"
                    title="Delete chat"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {sessions.length === 0 && (
                <div className="px-3 py-2.5 text-xs text-ink-muted">No recent chats</div>
              )}
            </div>
          </SideSection>

        </div>

        <div className="p-4 mt-2">
          <Button
            variant="ghost"
            className="w-full justify-start text-[14px] gap-2.5 text-ink-secondary hover:text-ink-primary px-2 hover:bg-gray-100"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* ── Main Panel ──────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-bg-base">
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-bg-surface">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-[8px] overflow-hidden shrink-0 border border-border">
              <img src="/bot.png" alt="Agent47 Logo" className="h-full w-full object-cover" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Agent47</span>
          </div>
          <button onClick={handleLogout} className="p-1.5 text-ink-secondary hover:text-ink-primary rounded-lg hover:bg-gray-100">
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          {chatHistory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 animate-fade-in-up pb-[10vh]">
              <div className="relative mb-6">
                <div className="h-20 w-20 rounded-[18px] overflow-hidden shadow-card border border-border">
                  <img src="/bot.png" alt="Agent47 Logo" className="h-full w-full object-cover" />
                </div>
              </div>
              <h2 className="text-[32px] font-semibold text-ink-primary mb-3 tracking-tight">
                How can I help you today?
              </h2>
              <p className="text-[16px] font-light text-ink-secondary max-w-[420px] leading-relaxed mb-10 tracking-tight">
                Your AI workspace assistant. Draft emails, organize calendars, and synthesize documents effortlessly.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 justify-center w-full max-w-4xl pb-4">
                {[
                  {
                    icon: Mail, label: 'Send an Email', desc: 'Draft and send a professional email',
                    prompt: `Send an email to [Recipient Email] about [Topic]. Keep it professional and concise. Also tell me what name I should sign off with.`,
                  },
                  {
                    icon: Wand2, label: 'Format This For Me', desc: 'Turn messy text into a clean Google Doc.',
                    prompt: `Format This For Me: [Paste messy dictation here] -> Create a nicely formatted Google Doc.`,
                  },
                  {
                    icon: Search, label: 'TL;DR Generator', desc: 'Summarize a long Doc instantly.',
                    prompt: `Run TL;DR Generator on this link: [Paste Google Doc Link]. Add an executive summary to the top.`,
                  },
                  {
                    icon: FileSpreadsheet, label: 'Data Analyst', desc: 'Ask questions about your budget sheets.',
                    prompt: `Act as a Natural Language Data Analyst. Read this sheet [Paste Sheet Link] and tell me my largest expenses.`,
                  },
                  {
                    icon: FileSpreadsheet, label: 'Create a Document', desc: 'Create a new Google Doc with structure',
                    prompt: `Create a new Google Doc titled "EC 2 instance in AWS" with headings: Overview, Usecases, Costs, and How to?. Write a short, clear explanation under each heading, use proper spacing and bullets where helpful, and format it as a polished professional technical document.`,
                  },
                  {
                    icon: Presentation, label: 'Deck Summarizer', desc: 'Extract takeaways from a massive slide deck.',
                    prompt: `Run the Deck Summarizer on this presentation [Paste Slide Link]. Give me the 3 main takeaways.`,
                  },
                  {
                    icon: Calendar, label: 'Schedule an Event', desc: 'Add a meeting or event to your calendar',
                    prompt: `Schedule an event titled "Team Sync" for tomorrow at 10:00 AM for 1 hour and add a short agenda in the description.`,
                  },
                ].map(({ icon: Icon, label, desc, prompt }) => (
                  <button
                    key={label}
                    onClick={() => { setInputValue(prompt); setTimeout(() => inputRef.current?.focus(), 0); }}
                    className="quick-action-card flex flex-col items-start px-4 py-4 bg-white border border-border rounded-[20px] text-left transition-all duration-200 cursor-pointer w-full min-w-0"
                  >
                    <Icon className="h-5 w-5 mb-2.5 text-ink-primary" />
                    <span className="text-[13px] font-semibold text-ink-primary leading-snug break-words tracking-tight">{label}</span>
                    <span className="text-[12px] font-light mt-1.5 leading-snug break-words text-ink-secondary tracking-tight">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto pb-4">
              {chatHistory.map((msg) => (
                <ChatBubble key={msg.id} message={msg.text} isUser={msg.isUser} isError={msg.isError} />
              ))}
              {isSending && (
                <div className="flex items-end gap-3 mb-5 animate-fade-in-up">
                  <div className="h-8 w-8 rounded-[8px] overflow-hidden shrink-0 border border-border mb-0.5">
                    <img src="/bot.png" alt="AI" className="h-full w-full object-cover" />
                  </div>
                  <div className="bg-white border border-border rounded-[20px] rounded-bl-sm px-4 py-3 flex items-center gap-1.5 shadow-sm">
                    <span className="typing-dot bg-ink-muted" />
                    <span className="typing-dot bg-ink-muted" />
                    <span className="typing-dot bg-ink-muted" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="px-4 md:px-8 pb-8 pt-2 bg-transparent">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSend} className="relative flex items-center w-full">
              <div className="flex-1 flex items-start bg-white rounded-[24px] border border-border pl-6 pr-2 pt-[14px] pb-[14px] focus-within:border-accent/40 focus-within:shadow-glow-sm shadow-sm transition-all duration-200 min-h-[56px]">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); }
                  }}
                  placeholder={isRecording ? 'Listening…' : isTranscribing ? 'Transcribing…' : 'Message Agent47...'}
                  rows={1}
                  className="flex-1 bg-transparent border-none focus:outline-none text-ink-primary text-[15px] placeholder:text-ink-muted w-full resize-none overflow-y-auto leading-relaxed pt-0.5"
                  style={{ minHeight: '28px', maxHeight: '180px' }}
                  disabled={isSending}
                />
                <button
                  type="button"
                  onClick={handleVoiceToggle}
                  disabled={isSending}
                  title={isRecording ? 'Stop recording & send' : 'Start voice input'}
                  className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-full mr-1 transition-all duration-200 bg-transparent cursor-pointer border-none outline-none disabled:opacity-30 ${isRecording ? "text-red-500 mic-recording" : "text-ink-secondary hover:text-ink-primary hover:bg-gray-100"}`}
                >
                  {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isSending}
                  title="Send message"
                  className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full transition-all duration-200 disabled:opacity-30 disabled:pointer-events-none active:scale-90 cursor-pointer text-white"
                  style={{ backgroundColor: (!inputValue.trim() || isSending) ? '#e5e5ea' : 'var(--color-accent)' }}
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  ) : (
                    <Send className="h-4 w-4 ml-0.5" />
                  )}
                </button>
              </div>
            </form>
            {voiceError && <p className="text-center mt-2 text-[12px] text-red-500 leading-tight">{voiceError}</p>}
            <p className="text-center mt-3 text-[12px] text-ink-muted leading-tight font-light">
              Agent47 can make mistakes. Consider verifying important information.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
