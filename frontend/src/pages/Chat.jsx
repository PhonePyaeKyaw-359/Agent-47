import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Loader2, Inbox, Send, MessageSquare, Mic, MicOff, Trash2, Mail, Calendar, CreditCard, Wand2, Search, Presentation, ListChecks, FileSpreadsheet, Bot } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { chatService, authService, WS_BASE_URL } from '../services/api';
import { ChatBubble } from '../components/ChatBubble';
import { Button } from '../components/Button';

/* ─── Sidebar Section wrapper ───────────────────────────────────── */
function SideSection({ label, children }) {
  return (
    <div className="space-y-1.5 mt-6">
      <p className="text-[12px] font-semibold tracking-[-0.01em] text-ink-muted-48 px-3">
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
  const chatHistory = React.useMemo(() => (activeSession ? activeSession.messages : []), [activeSession]);
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

  const triggerIntentForm = (intentName) => {
    let payload = {};
    switch(intentName) {
      case 'send_email':
        payload = { to: '', content_type: '', subject: '', tone: '', body: '', sender: '', attachment: '' };
        break;
      case 'do_format':
        payload = { text_or_doc_link: '', action: 'create_new', style: '', tone: '' };
        break;
      case 'execute_summary':
        payload = { source_doc_link: '', length: '', focus: '' };
        break;
      case 'data_analysis':
        payload = { sheet_link: '', nl_queries: '' };
        break;
      case 'generate_docs':
        payload = { title: '', content_type: '', outline: '', content_depth: '', tone: '' };
        break;
      default:
        return;
    }

    const aiMessage = {
      id: Date.now(),
      isUser: false,
      text: `Please fill out the details below to proceed:\n\n\`\`\`json\n${JSON.stringify({ intent: intentName, payload }, null, 2)}\n\`\`\``
    };
    addMessage(aiMessage);
  };

  const getErrorMessage = (error) => {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (detail?.message) return detail.message;
    if (detail?.error) return detail.error;
    return error.response?.data?.message || error.message;
  };

  const handleSend = async (e, overrideText) => {
    if (e?.preventDefault) e.preventDefault();
    const trimmedInput = (typeof overrideText === 'string' ? overrideText : inputValue).trim();
    if (!trimmedInput && !overrideText) return;
    if (isSending) return;

    if (!overrideText && /\[paste messy dictation here\]/i.test(trimmedInput)) {
      setVoiceError('Paste your dictation into the Format This For Me template before sending.');
      setTimeout(() => setVoiceError(''), 4000);
      inputRef.current?.focus();
      return;
    }

    // Determine if it's a structured Intent execution bypassing normal chat
    const isIntentExecution = typeof overrideText === 'object' && overrideText.intent;

    let displayText = trimmedInput;
    if (isIntentExecution) {
      displayText = `Executing action: ${overrideText.intent.replace(/_/g, ' ')}...`;
    }

    const userMessage = { text: displayText, rawText: trimmedInput, isUser: true, id: Date.now() };
    addMessage(userMessage);
    if (!overrideText) setInputValue('');
    setIsSending(true);

    try {
      let response;
      if (isIntentExecution) {
        response = await chatService.executeAction(userId, overrideText, sessionId || "");
      } else {
        response = await chatService.runAgent(userId, trimmedInput, sessionId || "");
      }

      if (response.session_id && response.session_id !== sessionId) {
        updateSessionId(sessionId, response.session_id);
      }
      
      // If it's pure text result from API execution
      const textToDisplay = response.result ? response.result : response.response;
      addMessage({ text: textToDisplay, isUser: false, id: Date.now() + 1, steps: response.steps });
    } catch (error) {
      addMessage({
        text: `Error: ${getErrorMessage(error)}`,
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
          addMessage({ text: response.response, isUser: false, id: Date.now() + 1, steps: response.steps });
        } catch (error) {
          addMessage({ text: `Error: ${getErrorMessage(error)}`, isUser: false, id: Date.now() + 1, isError: true, });
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
      <div className="flex h-screen w-full items-center justify-center gap-3 bg-canvas text-ink font-sans">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-[17px] text-ink-muted-80 tracking-apple">Verifying authentication…</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-ink font-sans">
      {/* ── Sidebar (Parchment Tile) ─────────────────────────── */}
      <aside className="hidden md:flex w-[260px] flex-col bg-canvas-parchment border-r border-hairline shrink-0 z-20">
        
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-[18px] border-b border-hairline">
          <Bot className="w-5 h-5 text-ink" />
          <span className="text-[17px] font-semibold tracking-[-0.01em] text-ink font-display">Agent47</span>
        </div>

        {/* User */}
        <div className="px-4 mt-5 mb-2">
          <div className="bg-canvas border border-hairline rounded-[8px] px-3 py-2 flex items-center gap-3">
            <div className="flex flex-col min-w-0">
              <p className="text-[14px] text-ink font-semibold truncate tracking-[-0.01em]" title={userId}>{userId}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                <span className="text-[12px] text-ink-muted-80 font-normal leading-none">Connected</span>
              </div>
            </div>
          </div>
        </div>

        {/* New Chat Button */}
        <div className="px-4 mt-3">
           <Button
             onClick={createNewSession}
             variant="dark-utility"
             className="w-full justify-center gap-2 h-[32px]"
           >
             + New Chat
           </Button>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto px-2 mt-2">
          <SideSection label="Recent">
            <div className="space-y-0.5">
              {sessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => setActiveSession(s.id)}
                  className={`group flex items-center gap-3 px-3 py-2 rounded-[8px] cursor-pointer transition-colors duration-150 text-[14px] tracking-[-0.01em] ${s.id === activeSessionId ? 'bg-canvas text-primary font-medium shadow-sm' : 'text-ink hover:bg-canvas-parchment hover:text-ink font-normal'}`}
                >
                  <MessageSquare className={`w-[14px] h-[14px] shrink-0 ${s.id === activeSessionId ? 'text-primary' : 'text-ink-muted-48 group-hover:text-ink'}`} />
                  <span className="truncate flex-1">{s.title || 'New Chat'}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); useAuthStore.getState().deleteSession(s.id); }}
                    className="ml-auto opacity-0 group-hover:opacity-100 text-ink-muted-48 hover:text-red-500 transition-colors p-0.5 rounded cursor-pointer shrink-0"
                    title="Delete chat"
                  >
                    <Trash2 className="w-[14px] h-[14px]" />
                  </button>
                </div>
              ))}
              {sessions.length === 0 && (
                <div className="px-3 py-2.5 text-[14px] text-ink-muted-48">No recent chats</div>
              )}
            </div>
          </SideSection>
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-hairline">
          <Button
            variant="ghost"
            className="w-full justify-start text-[14px] gap-2.5 text-ink hover:bg-black/5"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* ── Main Panel (White Tile) ──────────────────────── */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-canvas">
        
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-4 h-[52px] border-b border-hairline bg-canvas z-20">
          <div className="flex items-center gap-2.5">
            <Bot className="w-5 h-5 text-ink" />
            <span className="text-[17px] font-semibold tracking-[-0.01em] font-display text-ink">Agent47</span>
          </div>
          <button onClick={handleLogout} className="p-1.5 text-ink hover:bg-black/5 rounded-[8px]">
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 md:px-0 py-6">
          {chatHistory.length === 0 ? (
            <div className="flex flex-col items-center text-center px-4 animate-fade-in-up pb-[10vh] pt-[10vh]">
              <div className="h-20 w-20 bg-canvas-parchment rounded-full flex items-center justify-center mb-6">
                <Bot className="w-10 h-10 text-ink" />
              </div>
              <h2 className="text-[34px] font-semibold text-ink mb-3 tracking-display font-display">
                How can I help you today?
              </h2>
              <p className="text-[17px] text-ink-muted-80 max-w-lg leading-relaxed mb-12 tracking-apple">
                Your AI workspace assistant. Draft emails, organize calendars, and synthesize documents effortlessly.
              </p>

              {/* Utility Grid Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-4xl mx-auto px-4">
                {[
                  {
                    icon: Mail, label: 'Send an Email', desc: 'Draft and send a professional email.',
                    intent: 'send_email',
                  },
                  {
                    icon: Wand2, label: 'Format This For Me', desc: 'Turn messy text into a clean Doc.',
                    intent: 'do_format',
                  },
                  {
                    icon: Search, label: 'TL;DR Generator', desc: 'Summarize a long Doc instantly.',
                    intent: 'execute_summary',
                  },
                  {
                    icon: FileSpreadsheet, label: 'Data Analyst', desc: 'Ask questions about your budget sheets.',
                    intent: 'data_analysis',
                  },
                  {
                    icon: FileSpreadsheet, label: 'Create Document', desc: 'Create a structured Google Doc.',
                    intent: 'generate_docs',
                  },
                  {
                    icon: Calendar, label: 'Schedule Event', desc: 'Add a meeting to your calendar.',
                    prompt: `Schedule an event titled "Team Sync" for tomorrow at 10:00 AM for 1 hour and add a short agenda in the description.`,
                  },
                ].map(({ icon: Icon, label, desc, prompt, intent }) => (
                  <button
                    key={label}
                    onClick={() => {
                      if (intent) {
                        triggerIntentForm(intent);
                      } else if (prompt) {
                        setInputValue(prompt); setTimeout(() => inputRef.current?.focus(), 0);
                      }
                    }}
                    className="flex flex-col items-start p-5 bg-canvas border border-hairline rounded-[18px] text-left transition-colors duration-200 cursor-pointer w-full hover:bg-canvas-parchment"
                  >
                    <Icon className="h-5 w-5 mb-3 text-ink" />
                    <span className="text-[17px] font-semibold text-ink leading-snug tracking-apple">{label}</span>
                    <span className="text-[14px] font-normal mt-1.5 leading-snug text-ink-muted-80 tracking-[-0.01em]">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto pb-4 md:px-8">
              {chatHistory.map((msg) => (
                <ChatBubble key={msg.id} message={msg.text} isUser={msg.isUser} isError={msg.isError} steps={msg.steps} onExecuteIntent={(text) => handleSend(null, text)} />
              ))}
              {isSending && (
                <div className="flex items-end gap-2.5 mb-5 animate-fade-in-up w-full justify-start">
                  <div className="flex-shrink-0 h-7 w-7 rounded-full bg-canvas-parchment flex items-center justify-center border border-hairline mb-1">
                    <Bot className="h-[15px] w-[15px] text-ink-muted-80" />
                  </div>
                  <div className="flex items-center gap-1 py-2 px-1">
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

        {/* Input Area */}
        <div className="px-4 md:px-8 pb-8 pt-2 bg-canvas">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSend} className="relative flex items-center w-full z-10">
              <div className="flex-1 flex items-start bg-surface-pearl border border-hairline rounded-[24px] pl-5 pr-2 py-2 focus-within:ring-2 focus-within:ring-primary-focus focus-within:border-primary-focus transition-all duration-200 min-h-[52px]">
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
                  className="flex-1 bg-transparent border-none focus:outline-none text-ink text-[17px] placeholder:text-ink-muted-48 w-full resize-none overflow-y-auto leading-[1.47] tracking-apple pt-1 mt-1"
                  style={{ minHeight: '26px', maxHeight: '180px' }}
                  disabled={isSending}
                />
                
                <div className="flex items-center self-end pb-0.5">
                  <button
                    type="button"
                    onClick={handleVoiceToggle}
                    disabled={isSending}
                    title={isRecording ? 'Stop recording' : 'Start dictation'}
                    className={`h-[36px] w-[36px] shrink-0 flex items-center justify-center rounded-full mr-1 transition-all duration-200 bg-transparent cursor-pointer border-none outline-none disabled:opacity-48 ${isRecording ? "text-red-500 mic-recording" : "text-ink-muted-80 hover:text-ink hover:bg-black/5"}`}
                  >
                    {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </button>
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isSending}
                    title="Send message"
                    className={`h-[36px] w-[36px] shrink-0 flex items-center justify-center rounded-full transition-transform active:scale-[0.95] cursor-pointer text-white ${(!inputValue.trim() || isSending) ? 'bg-canvas-parchment text-ink-muted-48 pointer-events-none' : 'bg-primary hover:bg-primary-focus'}`}
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      <Send className="h-4 w-4 ml-0.5" />
                    )}
                  </button>
                </div>
              </div>
            </form>
            {voiceError && <p className="text-center mt-2 text-[12px] text-red-500 leading-tight">{voiceError}</p>}
            <p className="text-center mt-3 text-[12px] text-ink-muted-48 leading-tight font-normal tracking-[-0.01em]">
              Agent47 can make mistakes. Consider verifying important information.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
