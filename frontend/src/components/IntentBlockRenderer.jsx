import React, { useEffect, useRef, useState } from 'react';
import { Check, Edit2, ArrowRight, ArrowLeft, History, Mail, FileText, Search, BarChart3, FilePlus, Send, RefreshCw, Calendar, Loader2, Upload, X, Presentation, Wand2 } from 'lucide-react';
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
  summarize_slides: Presentation,
  data_analysis: BarChart3,
  generate_docs: FilePlus,
  schedule_event: Calendar,
};

const intentLabels = {
  send_email: "Compose Email",
  do_format: "Format Document",
  execute_summary: "Generate Summary",
  summarize_slides: "Summarize Slides",
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
    attachment:   "Attach a Google Doc, Slides, Sheet, or Drive link? Leave blank if none.",
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
  summarize_slides: {
    presentation_link: "Which Google Slides deck should I summarize?",
    length:            "What kind of summary do you want?",
    focus:             "Anything specific to focus on? Leave blank for a general deck summary.",
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
  presentation_link: 'Slides Deck',
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

const intentFieldChoices = {
  summarize_slides: {
    length: ['Executive summary', 'Slide-by-slide', 'Key takeaways', 'Action items'],
  },
};

const emailDraftPlaceholders = new Set([
  '(draft content)',
  '(write the actual drafted email body here based on the subject and user context)',
]);

const isEmailDraftPlaceholder = (value) => (
  typeof value === 'string' && emailDraftPlaceholders.has(value.trim().toLowerCase())
);

const canAutoDraftEmailBody = (data, status) => (
  Boolean(data.subject?.trim())
  && !['edited', 'confirmed'].includes(status.body)
);

const naturalExamples = {
  send_email: 'Email nina@example.com a friendly update that the Q2 deck is ready for review.',
  schedule_event: 'Schedule a 30 minute planning sync tomorrow at 10am with alex@example.com and add Google Meet.',
  do_format: 'Turn these messy notes into a professional meeting memo.',
  execute_summary: 'Summarize this Google Doc into 5 bullets focused on action items.',
  summarize_slides: 'Summarize this Slides deck as key takeaways for leadership.',
  data_analysis: 'Analyze this budget sheet and find the top spending categories.',
  generate_docs: 'Create a detailed project proposal for the hackathon demo in a professional tone.',
};

const naturalIntakeCopy = {
  send_email: {
    heading: 'Describe the email you want to send',
    helper: 'Include the recipient, purpose, tone, and any key points. Agent47 will draft the editable email fields for review.',
    placeholder: 'Example: Email nina@example.com a friendly update that the Q2 deck is ready for review.',
  },
  do_format: {
    heading: 'Paste or describe what needs cleaning up',
    helper: 'Share messy notes, a Doc link, or the format you want. Agent47 will prepare the document details.',
    placeholder: 'Example: Turn my meeting notes into a clean professional memo with action items.',
  },
  execute_summary: {
    heading: 'Tell Agent47 what to summarize',
    helper: 'Add a Google Doc link, preferred length, and anything specific to focus on.',
    placeholder: 'Example: Summarize this Google Doc into 5 bullets focused on action items.',
  },
  summarize_slides: {
    heading: 'Tell Agent47 which deck to summarize',
    helper: 'Add a Slides link or describe the summary style you need, such as key takeaways or slide-by-slide.',
    placeholder: 'Example: Summarize this Slides deck as key takeaways for leadership.',
  },
  data_analysis: {
    heading: 'Ask a question about your spreadsheet',
    helper: 'Add a Sheets link and the analysis you want. Agent47 will turn it into the right data request.',
    placeholder: 'Example: Analyze this budget sheet and find the top spending categories.',
  },
  generate_docs: {
    heading: 'Describe the document you want created',
    helper: 'Include the title, document type, depth, tone, and any sections you want covered.',
    placeholder: 'Example: Create a detailed project proposal for the hackathon demo in a professional tone.',
  },
  schedule_event: {
    heading: 'Describe the event you want scheduled',
    helper: 'Include the title, date, time, duration, guests, and whether you want Google Meet.',
    placeholder: 'Example: Schedule a 30 minute planning sync tomorrow at 10am with alex@example.com and add Google Meet.',
  },
};

const naturalActionLabels = {
  send_email: 'Prepare my email',
  do_format: 'Clean this up',
  execute_summary: 'Summarize this doc',
  summarize_slides: 'Summarize this deck',
  data_analysis: 'Analyze my data',
  generate_docs: 'Create my document',
  schedule_event: 'Prepare my event',
};

export function IntentBlockRenderer({ intentData, onExecute }) {
  const { intent, payload } = intentData;
  const initialPayload = typeof payload === 'object' && payload !== null ? payload : {};
  const hiddenFields = new Set(['local_attachments']);
  const isHiddenField = (key) => hiddenFields.has(key) || key.startsWith('__');
  const keys = Object.keys(initialPayload).filter(key => !isHiddenField(key));

  const [formData, setFormData] = useState(initialPayload);
  const [focusedField, setFocusedField] = useState(null);
  const [fileQuery, setFileQuery] = useState('');
  const [fileOptions, setFileOptions] = useState([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [fileError, setFileError] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [isDraftingBody, setIsDraftingBody] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [attachmentError, setAttachmentError] = useState('');
  const [naturalText, setNaturalText] = useState('');
  const [isParsingIntent, setIsParsingIntent] = useState(false);
  const [parseError, setParseError] = useState('');
  const [parseNote, setParseNote] = useState('');
  const [showBlocks, setShowBlocks] = useState(() => !initialPayload.__require_nl && keys.some(key => Boolean(initialPayload[key])));
  const userId = useAuthStore((s) => s.userId);

  const [blockStatus, setBlockStatus] = useState(() => {
    const s = {};
    keys.forEach(key => { s[key] = initialPayload[key] ? 'suggested' : 'empty'; });
    return s;
  });
  const blockStatusRef = useRef(blockStatus);

  useEffect(() => {
    blockStatusRef.current = blockStatus;
  }, [blockStatus]);

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setBlockStatus(prev => ({ ...prev, [key]: 'edited' }));
  };

  const applyParsedPayload = (parsedPayload = {}, missing = []) => {
    const missingSet = new Set(missing);
    let nextData = { ...formData };
    const nextStatus = { ...blockStatus };

    keys.forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(parsedPayload, key)) return;
      if (['edited', 'confirmed'].includes(blockStatus[key])) return;

      const value = parsedPayload[key];
      const hasValue = Array.isArray(value)
        ? value.length > 0
        : Boolean(String(value ?? '').trim());

      if (hasValue) {
        nextData[key] = value;
        nextStatus[key] = 'suggested';
      } else if (missingSet.has(key)) {
        nextStatus[key] = 'empty';
      }
    });

    setFormData(nextData);
    setBlockStatus(nextStatus);
    setEditingIndex(null);
    setShowBlocks(true);

    if (intent === 'send_email') {
      maybeDraftEmailBody('body', nextData, nextStatus);
    }
  };

  const parseNaturalLanguage = async () => {
    if (!naturalText.trim() || isParsingIntent) return;
    setIsParsingIntent(true);
    setParseError('');
    setParseNote('');

    try {
      const data = await chatService.parseIntentPayload(userId, intent, naturalText, formData);
      applyParsedPayload(data.payload || {}, data.missing || []);
      setParseNote(data.notes || 'AI filled the blocks it could understand. Review anything still blank.');
    } catch (error) {
      const detail = error.response?.data?.detail;
      setParseError(typeof detail === 'string' ? detail : detail?.message || 'Could not parse that sentence.');
    } finally {
      setIsParsingIntent(false);
    }
  };

  const readLocalFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const content = result.includes(',') ? result.split(',').pop() : result;
      resolve({
        filename: file.name,
        content,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      });
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });

  const handleLocalAttachmentUpload = async (files) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;

    const current = formData.local_attachments || [];
    const totalBytes = [...current, ...selected].reduce((sum, file) => sum + (file.size || 0), 0);
    if (totalBytes > 20 * 1024 * 1024) {
      setAttachmentError('Keep total local attachments under 20 MB for reliable Gmail sending.');
      return;
    }

    setAttachmentError('');
    try {
      const uploaded = await Promise.all(selected.map(readLocalFile));
      setFormData(prev => ({
        ...prev,
        local_attachments: [...(prev.local_attachments || []), ...uploaded],
      }));
      setBlockStatus(prev => ({ ...prev, attachment: 'edited' }));
    } catch {
      setAttachmentError('Could not read one of the selected files.');
    }
  };

  const removeLocalAttachment = (filename, index) => {
    setFormData(prev => ({
      ...prev,
      local_attachments: (prev.local_attachments || []).filter((file, i) => (
        i !== index || file.filename !== filename
      )),
    }));
    setBlockStatus(prev => ({ ...prev, attachment: 'edited' }));
  };

  const maybeDraftEmailBody = async (triggerKey, data = formData, status = blockStatus) => {
    if (intent !== 'send_email') return;
    if (!['to', 'content_type', 'subject', 'tone', 'sender', 'attachment', 'body'].includes(triggerKey)) return;
    if (isDraftingBody || !canAutoDraftEmailBody(data, status)) return;

    setIsDraftingBody(true);
    setDraftError('');

    try {
      const response = await chatService.draftEmailBody(userId, data);
      const draft = (response.body || '').trim();
      if (!draft) return;

      setFormData(prev => (
        !canAutoDraftEmailBody(prev, blockStatusRef.current)
          ? prev
          : { ...prev, body: draft }
      ));
      setBlockStatus(prev => (
        ['edited', 'confirmed'].includes(prev.body)
          ? prev
          : { ...prev, body: 'suggested' }
      ));
    } catch (error) {
      const detail = error.response?.data?.detail;
      setDraftError(typeof detail === 'string' ? detail : detail?.message || 'Could not draft the email body.');
    } finally {
      setIsDraftingBody(false);
    }
  };

  const confirmBlock = async (key) => {
    const nextStatus = { ...blockStatus, [key]: 'confirmed' };
    setBlockStatus(nextStatus);
    if (key === 'to' || key === 'cc' || key === 'sender') addCachedEmail(formData[key]);
    await maybeDraftEmailBody(key, formData, nextStatus);
    setEditingIndex(null);
  };

  const editBlock = (key) => {
    const index = keys.indexOf(key);
    if (index >= 0) setEditingIndex(index);
    setBlockStatus(prev => ({ ...prev, [key]: 'edited' }));
  };

  const jumpToBlock = (index) => {
    if (index <= firstUnconfirmedIndex || isAllConfirmed) {
      setEditingIndex(index);
      setBlockStatus(prev => ({ ...prev, [keys[index]]: 'edited' }));
    }
  };

  const handleExecute = () => {
    keys.forEach(k => {
      if (k === 'to' || k === 'cc' || k === 'sender') addCachedEmail(formData[k]);
    });
    const cleanPayload = Object.fromEntries(
      Object.entries(formData).filter(([key]) => !isHiddenField(key))
    );
    onExecute({ intent, payload: cleanPayload });
  };

  const firstUnconfirmedIndex = keys.findIndex(k => blockStatus[k] !== 'confirmed');
  const isAllConfirmed = firstUnconfirmedIndex === -1;
  const activeIndex = editingIndex ?? (isAllConfirmed ? keys.length : firstUnconfirmedIndex);

  useEffect(() => {
    const activeKey = keys[activeIndex];
    if (intent === 'send_email' && activeKey === 'body') {
      maybeDraftEmailBody('body');
    }
    // Draft only when the user reaches the body step or changes the subject.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, intent, formData.subject]);

  const IntentIcon = intentIcons[intent] || FileText;
  const intakeCopy = naturalIntakeCopy[intent] || {
    heading: 'Tell Agent47 what you want done',
    helper: 'Describe the action in one clear sentence. Agent47 will fill the details it understands.',
    placeholder: 'Type one natural-language instruction...',
  };
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
    presentation_link: {
      type: 'presentation',
      label: 'Google Slides',
      placeholder: 'Search your Google Slides…',
      emptyText: 'No Google Slides decks found. You can paste a link below.',
      manualPlaceholder: 'Or paste a Google Slides link…',
    },
    attachment: {
      type: 'workspace',
      label: 'Google Docs, Slides, or Sheets',
      placeholder: 'Search Docs, Slides, or Sheets…',
      emptyText: 'No Workspace files found. You can paste links below.',
      manualPlaceholder: 'Paste Google Doc, Slides, Sheet, or Drive links…',
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
    const shouldShow = index <= activeIndex || blockStatus[key] === 'confirmed';
    if (!shouldShow) return null;

    const status = blockStatus[key] || 'empty';
    const isActive = index === activeIndex && activeIndex < keys.length;
    const isConfirmed = status === 'confirmed';
    const canJumpBack = index < activeIndex || isAllConfirmed;

    const isTextArea = key === 'body' || key === 'outline' || key === 'nl_queries' || key === 'text_or_doc_link' || key === 'description';
    const filePicker = filePickerConfig[key];
    const isFilePickerField = Boolean(filePicker);
    const isEmailField = key === 'to' || key === 'cc' || key === 'sender';
    const choices = intentFieldChoices[intent]?.[key] || fieldChoices[key] || null;
    const isOptional = optionalFields.has(key);

    const value = formData[key];
    let displayValue = value;
    if (typeof value === 'object' && value !== null) displayValue = JSON.stringify(value, null, 2);
    const localAttachments = Array.isArray(formData.local_attachments) ? formData.local_attachments : [];
    const attachmentCount = localAttachments.length;
    const hasFieldValue = Boolean(displayValue) || (key === 'attachment' && attachmentCount > 0);

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
          <button
            type="button"
            onClick={() => jumpToBlock(index)}
            disabled={!canJumpBack && !isConfirmed}
            title={canJumpBack || isConfirmed ? `Edit ${shortLabel}` : undefined}
            className={`
            w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10
            transition-all duration-300 text-[12px] font-semibold font-display
            border-none outline-none
            ${isConfirmed
              ? 'bg-primary text-white shadow-[0_0_0_3px_rgba(0,102,204,0.12)]'
              : isActive
                ? 'bg-canvas border-2 border-primary text-primary shadow-[0_0_0_3px_rgba(0,102,204,0.08)]'
                : 'bg-canvas-parchment border border-hairline text-ink-muted-48'}
            ${(canJumpBack || isConfirmed) ? 'cursor-pointer hover:scale-105' : 'cursor-default'}
          `}>
            {isConfirmed ? <Check className="w-3.5 h-3.5" /> : <span>{index + 1}</span>}
          </button>
          {index < keys.length - 1 && (
            <div className={`
              w-[1.5px] flex-1 min-h-[20px] transition-colors duration-300 mt-1 mb-1
              ${isConfirmed && index < activeIndex ? 'bg-primary/30' : 'bg-hairline'}
            `} />
          )}
        </div>

        {/* Block content */}
        <div className={`flex-1 pb-4 transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-55'}`}>
          <div
            onClick={() => {
              if (isConfirmed || canJumpBack) jumpToBlock(index);
            }}
            className={`
            border rounded-[14px] p-3.5 transition-all duration-300
            ${isConfirmed
              ? 'bg-canvas-parchment/50 border-hairline cursor-pointer hover:border-primary/25 hover:bg-primary/5'
              : 'bg-canvas border-primary/15 shadow-[0_2px_12px_rgba(0,102,204,0.04)]'}
          `}>

            {isConfirmed ? (
              /* ── Confirmed state ─────────────────────────── */
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted-48">{shortLabel}</span>
                  <button onClick={(e) => { e.stopPropagation(); editBlock(key); }} className="text-[11px] font-medium text-ink-muted-48 hover:text-primary flex items-center gap-1 transition-colors bg-transparent border-none cursor-pointer px-1.5 py-0.5 rounded-md hover:bg-primary/5">
                    <Edit2 className="w-3 h-3" /> Edit
                  </button>
                </div>
                <div className="text-[14px] text-ink leading-relaxed line-clamp-3 overflow-hidden relative pr-2 font-normal">
                  {key === 'attachment' && attachmentCount > 0 ? (
                    <span>
                      {displayValue ? `${displayValue}\n` : ''}
                      {attachmentCount} local file{attachmentCount === 1 ? '' : 's'} attached
                    </span>
                  ) : (
                    displayValue || <em className="text-ink-muted-48 font-normal">No content provided</em>
                  )}
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

                {intent === 'schedule_event' && key === 'description' && (
                  <div className="mt-3 mb-4 p-4 bg-primary/5 border border-primary/15 rounded-[12px] text-[13px] text-ink-muted-80 space-y-3 relative">
                    <p className="font-semibold text-primary text-[14px]">📝 What "Add description" is</p>
                    <p className="leading-relaxed">It’s a detailed notes field for your event. Unlike the title (which is short), this section is where you explain everything about the meeting.</p>
                    <p className="leading-relaxed bg-white/50 p-2 rounded-md">Think of it as:<br/><span className="text-ink font-medium">👉 the full context + instructions for anyone attending</span></p>
                    
                    <div className="pt-1">
                      <p className="font-semibold text-ink mb-2">🔍 What you should put inside:</p>
                      <ul className="space-y-2 list-none pl-0">
                        <li><strong className="text-ink">1. 📌 Purpose of the event</strong><br/><span className="opacity-80 block mt-0.5">Explain why this meeting exists (e.g., "Weekly FlickShare growth sync")</span></li>
                        <li><strong className="text-ink">2. 📋 Agenda (very important)</strong><br/><span className="opacity-80 block mt-0.5">List what will happen during the meeting</span></li>
                        <li><strong className="text-ink">3. 🔗 Important links</strong><br/><span className="opacity-80 block mt-0.5">Docs (Notion, Google Docs), GitHub repo, Figma designs</span></li>
                        <li><strong className="text-ink">4. 👥 Instructions for participants</strong><br/><span className="opacity-80 block mt-0.5">Tell people what to prepare (e.g., "Bring latest analytics data")</span></li>
                        <li><strong className="text-ink">5. 📎 Extra context / notes</strong><br/><span className="opacity-80 block mt-0.5">Anything people should know before joining (e.g., "This meeting is recorded")</span></li>
                      </ul>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const template = "1. 📌 Purpose of the event:\n\n2. 📋 Agenda:\n\n3. 🔗 Important links:\n\n4. 👥 Instructions for participants:\n\n5. 📎 Extra context / notes:\n";
                        handleChange(key, template);
                      }}
                      className="mt-3 w-full bg-white border border-primary/20 text-primary hover:bg-primary hover:text-white font-medium py-2 rounded-lg transition-colors text-[13px] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Use this template
                    </button>
                  </div>
                )}

                {intent === 'send_email' && key === 'body' && isDraftingBody && (
                  <div className="inline-flex items-center gap-1.5 text-[12px] text-primary font-medium bg-primary/5 rounded-full px-2.5 py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Drafting from your subject
                  </div>
                )}
                
                {intent === 'send_email' && key === 'body' && !isDraftingBody && (!displayValue || isEmailDraftPlaceholder(displayValue)) && (
                  <button
                    type="button"
                    onClick={() => maybeDraftEmailBody('subject')}
                    className="inline-flex items-center gap-1.5 text-[12px] text-primary font-medium bg-primary/10 hover:bg-primary/20 rounded-full px-2.5 py-1 transition-colors mb-2 cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" /> Auto-draft body now
                  </button>
                )}

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
                            const nextValue = key === 'attachment' && displayValue
                              ? `${displayValue}\n${file.url}`
                              : file.url;
                            handleChange(key, nextValue);
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
                      value={isEmailDraftPlaceholder(displayValue) ? "" : (displayValue || '')}
                      onChange={handleChangeAdapter}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmBlock(key); } }}
                      className={`${inputClasses} min-h-[72px] resize-y leading-relaxed`}
                      placeholder={filePicker.manualPlaceholder}
                    />

                    {key === 'attachment' && (
                      <div className="space-y-2">
                        <label className="flex items-center justify-center gap-2 min-h-10 rounded-[10px] border border-dashed border-primary/30 bg-primary/5 text-primary text-[13px] font-medium cursor-pointer hover:bg-primary/8 transition-colors">
                          <Upload className="w-4 h-4" />
                          Upload local files
                          <input
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              handleLocalAttachmentUpload(e.target.files);
                              e.target.value = '';
                            }}
                          />
                        </label>

                        {attachmentError && <p className="text-[12px] text-red-500 leading-snug">{attachmentError}</p>}

                        {localAttachments.length > 0 && (
                          <div className="rounded-[10px] border border-hairline bg-surface-pearl divide-y divide-hairline overflow-hidden">
                            {localAttachments.map((file, fileIndex) => (
                              <div key={`${file.filename}-${fileIndex}`} className="flex items-center justify-between gap-2 px-3 py-2">
                                <div className="min-w-0">
                                  <div className="text-[13px] font-medium text-ink truncate">{file.filename}</div>
                                  <div className="text-[11px] text-ink-muted-48">
                                    {file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : 'Local file'}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeLocalAttachment(file.filename, fileIndex)}
                                  className="w-7 h-7 rounded-full border border-transparent bg-transparent text-ink-muted-48 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors"
                                  title={`Remove ${file.filename}`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
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
                    value={isEmailDraftPlaceholder(displayValue) ? "" : (displayValue || '')}
                    onChange={handleChangeAdapter}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmBlock(key); } }}
                    autoFocus
                    className={`${inputClasses} ${key === 'body' ? 'min-h-[180px]' : 'min-h-[88px]'} resize-y leading-relaxed whitespace-pre-wrap`}
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
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingIndex(Math.max(0, index - 1))}
                    disabled={index === 0}
                    className="inline-flex items-center gap-1.5 h-8 text-[13px] font-medium text-ink-muted-80 hover:text-primary rounded-full px-3 transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none border border-transparent hover:border-primary/20 bg-transparent"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                  </button>
                  <div className="flex items-center justify-end gap-2">
                  {intent === 'send_email' && key === 'subject' && isDraftingBody && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-primary font-medium">
                      <Loader2 className="w-3 h-3 animate-spin" /> Drafting body
                    </span>
                  )}
                  {isOptional && !hasFieldValue && (
                    <span className="text-[11px] text-ink-muted-48">Optional</span>
                  )}
                  <button
                    onClick={() => confirmBlock(key)}
                    disabled={!hasFieldValue && !isOptional}
                    className="inline-flex items-center gap-1.5 h-8 text-[13px] font-medium bg-primary hover:bg-primary-focus text-white rounded-full px-4 transition-all duration-200 active:scale-[0.96] cursor-pointer disabled:opacity-40 disabled:pointer-events-none border-none"
                  >
                    {isAllConfirmed || index < keys.length - 1 ? (isOptional && !hasFieldValue ? 'Skip' : 'Next') : 'Done'} <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  </div>
                </div>
                )}
                {intent === 'send_email' && key === 'body' && draftError && (
                  <p className="text-[12px] text-red-500 leading-snug">{draftError}</p>
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
            {showBlocks ? `Step ${Math.min(activeIndex + 1, keys.length)} of ${keys.length}` : 'Start with one sentence'}
          </span>
        </div>
      </div>

      <div className={`mb-4 rounded-[14px] border p-4 transition-colors ${showBlocks ? 'border-hairline bg-canvas-parchment/45' : 'border-primary/20 bg-primary/5'}`}>
        <div className="min-w-0 space-y-3.5">
            <div className="space-y-2.5">
              <div className="space-y-1">
                <p className="text-[16px] font-semibold text-ink leading-snug tracking-[-0.01em] font-display">{intakeCopy.heading}</p>
                <p className="text-[13px] text-ink-muted-80 leading-relaxed">
                  {intakeCopy.helper}
                </p>
              </div>
              <div className="rounded-[10px] border border-hairline bg-canvas/70 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-muted-48 mb-1">Example</p>
                <p className="text-[13px] text-ink-muted-80 leading-snug">
                  {naturalExamples[intent] || intakeCopy.placeholder}
                </p>
              </div>
            </div>
            <textarea
              value={naturalText}
              onChange={(e) => setNaturalText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  parseNaturalLanguage();
                }
              }}
              className={`w-full rounded-[12px] border border-hairline bg-surface-pearl px-3.5 py-3.5 text-[14px] text-ink leading-relaxed placeholder:text-ink-muted-48 focus:outline-none focus:border-primary/45 focus:ring-2 focus:ring-primary/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] ${intent === 'send_email' ? 'min-h-[116px] resize-none' : 'min-h-[86px] resize-y'}`}
              placeholder=""
              disabled={isParsingIntent}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-ink-muted-48 leading-snug">Agent47 will fill what it understands. You can review every field next.</span>
              <button
                type="button"
                onClick={parseNaturalLanguage}
                disabled={!naturalText.trim() || isParsingIntent}
                className="inline-flex items-center gap-1.5 h-9 rounded-full bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-focus disabled:opacity-40 disabled:pointer-events-none border-none cursor-pointer shadow-[0_2px_8px_rgba(0,102,204,0.18)]"
              >
                {isParsingIntent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                {naturalActionLabels[intent] || 'Prepare this action'}
              </button>
            </div>
            {parseError && <p className="text-[12px] text-red-500 leading-snug">{parseError}</p>}
            {parseNote && <p className="text-[12px] text-primary leading-snug">{parseNote}</p>}
        </div>
      </div>

      {/* Progress bar */}
      {showBlocks && <div className="w-full bg-canvas-parchment rounded-full h-1 overflow-hidden mb-5">
        <div
          className="bg-primary h-1 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>}

      {/* Blocks */}
      {showBlocks && <div>
        {keys.map((key, index) => renderBlock(key, index))}
      </div>}

      {/* Execute CTA */}
      {showBlocks && isAllConfirmed && (
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
