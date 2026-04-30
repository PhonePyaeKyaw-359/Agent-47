import React, { useEffect, useState } from 'react';
import { Check, Edit2, ArrowRight, History, Mail, FileText, Search, BarChart3, FilePlus, Send, RefreshCw, Calendar } from 'lucide-react';
import { chatService } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';

// --- Email Caching Utilities ---
const getCachedEmails = () => {
  try { return JSON.parse(localStorage.getItem('cached_emails') || '[]'); }
  catch { return []; }
};

const addCachedEmail = (emailStr) => {
  if (!emailStr) return;
  const emails = emailStr.split(',').map(e => e.trim()).filter(e => e && e.includes('@'));
  if (!emails.length) return;
  const cached = getCachedEmails();
  const newCache = [...new Set([...emails, ...cached])].slice(0, 30);
  localStorage.setItem('cached_emails', JSON.stringify(newCache));
};
// -------------------------------

const intentIcons = {
  send_email: Mail,
  do_format: FileText,
  execute_summary: Search,
  data_analysis: BarChart3,
  generate_docs: FilePlus,
  schedule_event: Calendar,
};

const intentLabels = {
  send_email: "Compose Email",
  do_format: "Format Document",
  execute_summary: "Generate Summary",
  data_analysis: "Analyze Data",
  generate_docs: "Create Document",
  schedule_event: "Schedule Event",
};

/* ── Conversational questions per intent+field ─────────────────── */
const fieldQuestions = {
  send_email: {
    to:           "Who should I send this email to?",
    content_type: "What kind of email is this? (e.g. follow-up, cold outreach, update…)",
    subject:      "What's the subject line?",
    tone:         "What tone should I use? (e.g. formal, friendly, casual…)",
    body:         "What should the email say?",
    sender:       "Who is this email from?",
    attachment:   "Any attachments? Paste a link or leave blank.",
  },
  do_format: {
    text_or_doc_link: "Paste the messy text or a Google Doc link here.",
    action:           "Should I clean up the original or create a new doc?",
    style:            "What format do you want? (e.g. bullet points, report, memo…)",
    tone:             "What tone? (e.g. professional, conversational…)",
  },
  execute_summary: {
    source_doc_link: "Paste the Google Doc link to summarize.",
    length:          "How long should the summary be? (e.g. 2 paragraphs, 5 bullets…)",
    focus:           "Anything specific to focus on? Leave blank for a general summary.",
  },
  data_analysis: {
    sheet_link: "Paste the Google Sheets link here.",
    nl_queries: "What questions do you want answered from the data?",
  },
  generate_docs: {
    title:         "What should the document be titled?",
    content_type:  "What type of document? (e.g. proposal, report, guide…)",
    outline:       "Any outline or key sections you have in mind?",
    content_depth: "How detailed? (e.g. brief overview, in-depth, exhaustive…)",
    tone:          "What tone? (e.g. academic, casual, professional…)",
  },
  schedule_event: {
    title:           "What should the event be called?",
    date:            "What date is it? (e.g. tomorrow, May 3, 2026)",
    start_time:      "What time does it start?",
    duration:        "How long is it?",
    attendees:       "Who should be invited? Add emails or leave blank.",
    description:     "What should the event description say?",
    add_google_meet: "Add a Google Meet link?",
  },
};

/* Fallback question for unknown intent/field combos */
const getQuestion = (intent, key) => {
  return fieldQuestions[intent]?.[key]
    || `What should "${key.replace(/_/g, ' ')}" be?`;
};

/* Short label for the confirmed-state header */
const fieldShortLabels = {
  to: 'Recipient', cc: 'CC', content_type: 'Type', subject: 'Subject',
  tone: 'Tone', body: 'Body', sender: 'From', attachment: 'Attachment',
  text_or_doc_link: 'Source', action: 'Action', style: 'Style',
  source_doc_link: 'Source Doc', length: 'Length', focus: 'Focus',
  sheet_link: 'Sheet', nl_queries: 'Questions', title: 'Title',
  outline: 'Outline', content_depth: 'Depth', date: 'Date',
  start_time: 'Start', duration: 'Duration', attendees: 'Guests',
  description: 'Description', add_google_meet: 'Meet',
};

/* Fields that can be left blank */
const optionalFields = new Set([
  'attachment', 'cc', 'focus', 'sender', 'attendees', 'description',
]);

/* Fields with selectable chip options instead of free-text */
const fieldChoices = {
  action: ['Clean up original', 'Create new doc'],
  style: ['Bullet points', 'Report', 'Memo', 'Meeting notes', 'Blog post'],
  tone: ['Professional', 'Friendly', 'Casual', 'Academic', 'Formal'],
  content_type: ['Follow-up', 'Cold outreach', 'Update', 'Invitation', 'Thank you', 'Proposal', 'Report', 'Guide'],
  content_depth: ['Brief overview', 'Detailed', 'Exhaustive'],
  length: ['1 paragraph', '3 bullets', '5 bullets', 'Half page', '1 page'],
  add_google_meet: ['No', 'Yes'],
};

export function IntentBlockRenderer({ intentData, onExecute }) {
  const { intent, payload } = intentData;
  const initialPayload = typeof payload === 'object' && payload !== null ? payload : {};
  const keys = Object.keys(initialPayload);

  const [formData, setFormData] = useState(initialPayload);
  const [focusedField, setFocusedField] = useState(null);
  const [fileQuery, setFileQuery] = useState('');
  const [fileOptions, setFileOptions] = useState([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [fileError, setFileError] = useState('');
  const userId = useAuthStore((s) => s.userId);

  const [blockStatus, setBlockStatus] = useState(() => {
    const s = {};
    keys.forEach(key => { s[key] = initialPayload[key] ? 'suggested' : 'empty'; });
    return s;
  });

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setBlockStatus(prev => ({ ...prev, [key]: 'edited' }));
  };

  const confirmBlock = (key) => {
    setBlockStatus(prev => ({ ...prev, [key]: 'confirmed' }));
    if (key === 'to' || key === 'cc' || key === 'sender') addCachedEmail(formData[key]);
  };

  const editBlock = (key) => {
    setBlockStatus(prev => ({ ...prev, [key]: 'edited' }));
  };

  const handleExecute = () => {
    keys.forEach(k => {
      if (k === 'to' || k === 'cc' || k === 'sender') addCachedEmail(formData[k]);
    });
    onExecute({ intent, payload: formData });
  };

  const firstUnconfirmedIndex = keys.findIndex(k => blockStatus[k] !== 'confirmed');
  const isAllConfirmed = firstUnconfirmedIndex === -1;
  const activeIndex = isAllConfirmed ? keys.length : firstUnconfirmedIndex;

  const IntentIcon = intentIcons[intent] || FileText;
  const progress = Math.round((activeIndex / keys.length) * 100);
  const filePickerConfig = {
    source_doc_link: {
      type: 'document',
      label: 'Google Docs',
      placeholder: 'Search your Google Docs…',
      emptyText: 'No Google Docs found. You can paste a link below.',
      manualPlaceholder: 'Or paste a Google Doc link…',
    },
    text_or_doc_link: {
      type: 'document',
      label: 'Google Docs',
      placeholder: 'Search your Google Docs…',
      emptyText: 'No Google Docs found. You can paste a link or text below.',
      manualPlaceholder: 'Or paste messy text / Doc link…',
    },
    sheet_link: {
      type: 'spreadsheet',
      label: 'Google Sheets',
      placeholder: 'Search your Google Sheets…',
      emptyText: 'No Google Sheets found. You can paste a link below.',
      manualPlaceholder: 'Or paste a Google Sheets link…',
    },
  };

  const loadFiles = async (config, query = '') => {
    if (!userId) return;
    setIsLoadingFiles(true);
    setFileError('');
    try {
      const data = await chatService.listGoogleFiles(userId, config.type, query);
      setFileOptions(data.files || data.docs || []);
    } catch (error) {
      const detail = error.response?.data?.detail;
      setFileError(typeof detail === 'string' ? detail : detail?.message || `Could not load ${config.label}.`);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    const activeKey = keys[activeIndex];
    const config = filePickerConfig[activeKey];
    if (!config) return;
    const timeout = setTimeout(() => loadFiles(config, fileQuery), 250);
    return () => clearTimeout(timeout);
  }, [activeIndex, fileQuery, userId]);

  const renderBlock = (key, index) => {
    if (index > activeIndex) return null;

    const status = blockStatus[key] || 'empty';
    const isActive = index === activeIndex;
    const isConfirmed = status === 'confirmed';

    const isTextArea = key === 'body' || key === 'outline' || key === 'nl_queries' || key === 'text_or_doc_link' || key === 'description';
    const filePicker = filePickerConfig[key];
    const isFilePickerField = Boolean(filePicker);
    const isEmailField = key === 'to' || key === 'cc' || key === 'sender';
    const choices = fieldChoices[key] || null;
    const isOptional = optionalFields.has(key);

    const value = formData[key];
    let displayValue = value;
    if (typeof value === 'object' && value !== null) displayValue = JSON.stringify(value, null, 2);

    const handleChangeAdapter = (e) => {
      let val = e.target.value;
      if (typeof value === 'object' && value !== null) {
        try { val = JSON.parse(val); } catch { /* keep string */ }
      }
      handleChange(key, val);
    };

    // Email autocomplete
    let suggestions = [];
    let handleSuggestionClick = null;
    if (isEmailField && !isConfirmed) {
      const cachedEmails = getCachedEmails();
      const parts = (displayValue || '').split(',');
      const search = parts[parts.length - 1].trim();
      suggestions = cachedEmails.filter(e =>
        e.toLowerCase().includes(search.toLowerCase()) &&
        !parts.map(s => s.trim().toLowerCase()).includes(e.toLowerCase())
      );
      handleSuggestionClick = (email) => {
        const p = (displayValue || '').split(',');
        p.pop();
        p.push(p.length > 0 ? ` ${email}` : email);
        handleChange(key, p.join(', '));
        setFocusedField(null);
      };
    }

    const question = getQuestion(intent, key);
    const shortLabel = fieldShortLabels[key] || key.replace(/_/g, ' ');
    const inputClasses = "w-full bg-surface-pearl border border-hairline rounded-[10px] px-3.5 py-2.5 text-[14px] text-ink focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/8 font-normal transition-all duration-200 placeholder:text-ink-muted-48";

    return (
      <div key={key} className="relative flex gap-3 animate-fade-in-up">
        {/* Stepper dot + line */}
        <div className="flex flex-col items-center">
          <div className={`
            w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10
            transition-all duration-300 text-[12px] font-semibold font-display
            ${isConfirmed
              ? 'bg-primary text-white shadow-[0_0_0_3px_rgba(0,102,204,0.12)]'
              : isActive
                ? 'bg-canvas border-2 border-primary text-primary shadow-[0_0_0_3px_rgba(0,102,204,0.08)]'
                : 'bg-canvas-parchment border border-hairline text-ink-muted-48'}
          `}>
            {isConfirmed ? <Check className="w-3.5 h-3.5" /> : <span>{index + 1}</span>}
          </div>
          {index < keys.length - 1 && (
            <div className={`
              w-[1.5px] flex-1 min-h-[20px] transition-colors duration-300 mt-1 mb-1
              ${isConfirmed && index < activeIndex ? 'bg-primary/30' : 'bg-hairline'}
            `} />
          )}
        </div>

        {/* Block content */}
        <div className={`flex-1 pb-4 transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-55'}`}>
          <div className={`
            border rounded-[14px] p-3.5 transition-all duration-300
            ${isConfirmed
              ? 'bg-canvas-parchment/50 border-hairline'
              : 'bg-canvas border-primary/15 shadow-[0_2px_12px_rgba(0,102,204,0.04)]'}
          `}>

            {isConfirmed ? (
              /* ── Confirmed state ─────────────────────────── */
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted-48">{shortLabel}</span>
                  <button onClick={() => editBlock(key)} className="text-[11px] font-medium text-ink-muted-48 hover:text-primary flex items-center gap-1 transition-colors bg-transparent border-none cursor-pointer px-1.5 py-0.5 rounded-md hover:bg-primary/5">
                    <Edit2 className="w-3 h-3" /> Edit
                  </button>
                </div>
                <div className="text-[14px] text-ink leading-relaxed line-clamp-3 overflow-hidden relative pr-2 font-normal">
                  {displayValue || <em className="text-ink-muted-48 font-normal">No content provided</em>}
                  {displayValue && displayValue.length > 150 && (
                    <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-canvas-parchment/50 to-transparent pointer-events-none" />
                  )}
                </div>
              </div>
            ) : (
              /* ── Active / editable state ────────────────── */
              <div className="space-y-3">
                {/* The conversational question */}
                <p className="text-[14px] font-medium text-ink leading-snug tracking-[-0.01em]">
                  {question}
                  {status === 'suggested' && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-full text-[10px] bg-primary/8 text-primary font-semibold align-middle">
                      <IntentIcon className="w-2.5 h-2.5" />AI prefilled
                    </span>
                  )}
                </p>

                {/* Input */}
                {isFilePickerField ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={fileQuery}
                        onChange={(e) => setFileQuery(e.target.value)}
                        className={inputClasses}
                        placeholder={filePicker.placeholder}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => loadFiles(filePicker, fileQuery)}
                        className="h-10 w-10 rounded-[10px] border border-hairline bg-surface-pearl text-ink-muted-80 hover:text-primary hover:border-primary/40 flex items-center justify-center transition-colors"
                        title={`Refresh ${filePicker.label}`}
                      >
                        <RefreshCw className={`w-4 h-4 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                      </button>
                    </div>

                    {fileError && <p className="text-[12px] text-red-500 leading-snug">{fileError}</p>}

                    <div className="max-h-48 overflow-y-auto rounded-[10px] border border-hairline bg-surface-pearl divide-y divide-hairline">
                      {fileOptions.map(file => (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => {
                            handleChange(key, file.url);
                            setTimeout(() => confirmBlock(key), 100);
                          }}
                          className="w-full text-left px-3 py-2.5 bg-transparent hover:bg-primary/5 transition-colors cursor-pointer"
                        >
                          <div className="text-[13px] font-medium text-ink truncate">{file.name}</div>
                          <div className="text-[11px] text-ink-muted-48 truncate">
                            {file.modifiedTime ? `Modified ${new Date(file.modifiedTime).toLocaleDateString()}` : file.url}
                          </div>
                        </button>
                      ))}
                      {!isLoadingFiles && fileOptions.length === 0 && (
                        <div className="px-3 py-3 text-[12px] text-ink-muted-48">
                          {filePicker.emptyText}
                        </div>
                      )}
                    </div>

                    <textarea
                      value={displayValue || ''}
                      onChange={handleChangeAdapter}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmBlock(key); } }}
                      className={`${inputClasses} min-h-[72px] resize-y leading-relaxed`}
                      placeholder={filePicker.manualPlaceholder}
                    />
                  </div>
                ) : choices ? (
                  /* ── Chip selector ─────────────────────────── */
                  <div className="flex flex-wrap gap-2">
                    {choices.map(option => {
                      const selected = displayValue && displayValue.toLowerCase() === option.toLowerCase();
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => { handleChange(key, option); setTimeout(() => confirmBlock(key), 150); }}
                          className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-all duration-150 cursor-pointer ${
                            selected
                              ? 'bg-primary text-white border-primary'
                              : 'bg-surface-pearl text-ink border-hairline hover:border-primary/40 hover:bg-primary/5'
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                ) : isTextArea ? (
                  <textarea
                    value={displayValue || ''}
                    onChange={handleChangeAdapter}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmBlock(key); } }}
                    autoFocus
                    className={`${inputClasses} min-h-[88px] resize-y leading-relaxed`}
                    placeholder="Type your answer… (Shift+Enter for new line)"
                  />
                ) : isEmailField ? (
                  <div className="relative">
                    <input
                      type="text"
                      value={displayValue || ''}
                      onChange={handleChangeAdapter}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmBlock(key); } }}
                      onFocus={() => setFocusedField(key)}
                      onBlur={() => setTimeout(() => setFocusedField(null), 200)}
                      autoFocus
                      className={inputClasses}
                      placeholder="Type your answer…"
                    />
                    {focusedField === key && suggestions.length > 0 && (
                      <ul className="absolute z-50 w-full bg-canvas border border-hairline rounded-[10px] shadow-lg mt-1 max-h-40 overflow-y-auto py-1">
                        <div className="px-3 py-1 text-[10px] font-semibold text-ink-muted-48 uppercase tracking-wider flex items-center gap-1">
                          <History className="w-3 h-3" /> Recent
                        </div>
                        {suggestions.map(email => (
                          <li
                            key={email}
                            className="px-3 py-2 text-[13px] text-ink hover:bg-primary/5 hover:text-primary cursor-pointer transition-colors flex items-center gap-2"
                            onMouseDown={() => handleSuggestionClick(email)}
                          >
                            <div className="w-5 h-5 rounded-full bg-primary/8 text-primary flex items-center justify-center font-semibold text-[10px] uppercase">
                              {email.charAt(0)}
                            </div>
                            {email}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={displayValue || ''}
                    onChange={handleChangeAdapter}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmBlock(key); } }}
                    autoFocus
                    className={inputClasses}
                    placeholder="Type your answer…"
                  />
                )}

                {/* Confirm / Next button — hidden for chip fields (auto-confirms on tap) */}
                {!choices && (
                <div className="flex items-center justify-end gap-2">
                  {isOptional && !displayValue && (
                    <span className="text-[11px] text-ink-muted-48">Optional</span>
                  )}
                  <button
                    onClick={() => confirmBlock(key)}
                    disabled={!displayValue && !isOptional}
                    className="inline-flex items-center gap-1.5 h-8 text-[13px] font-medium bg-primary hover:bg-primary-focus text-white rounded-full px-4 transition-all duration-200 active:scale-[0.96] cursor-pointer disabled:opacity-40 disabled:pointer-events-none border-none"
                  >
                    {isOptional && !displayValue ? 'Skip' : 'Next'} <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="my-3 w-full max-w-[540px] bg-canvas border border-hairline rounded-[18px] p-4 md:p-5 shadow-[0_2px_16px_rgba(0,0,0,0.04)] relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-[10px] bg-primary/8 text-primary shrink-0">
          <IntentIcon className="w-4 h-4" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-[16px] text-ink leading-tight font-display tracking-[-0.01em]">
            {intentLabels[intent] || "Action Setup"}
          </span>
          <span className="text-[12px] text-ink-muted-48 leading-tight mt-0.5 font-normal">
            Step {Math.min(activeIndex + 1, keys.length)} of {keys.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-canvas-parchment rounded-full h-1 overflow-hidden mb-5">
        <div
          className="bg-primary h-1 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Blocks */}
      <div>
        {keys.map((key, index) => renderBlock(key, index))}
      </div>

      {/* Execute CTA */}
      {isAllConfirmed && (
        <div className="mt-2 pt-4 border-t border-hairline flex justify-end animate-fade-in-up">
          <button
            onClick={handleExecute}
            className="inline-flex items-center gap-2 text-[14px] font-semibold h-10 px-6 rounded-full bg-primary text-white hover:bg-primary-focus shadow-[0_2px_8px_rgba(0,102,204,0.2)] hover:shadow-[0_4px_16px_rgba(0,102,204,0.25)] transition-all duration-300 active:scale-[0.96] cursor-pointer border-none"
          >
            <Send className="w-4 h-4" /> Execute Action
          </button>
        </div>
      )}
    </div>
  );
}
