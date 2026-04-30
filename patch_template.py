import re

with open('frontend/src/components/IntentBlockRenderer.jsx', 'r') as f:
    content = f.read()

helper_block_new = """
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
                        const template = "1. 📌 Purpose of the event:\\n\\n2. 📋 Agenda:\\n\\n3. 🔗 Important links:\\n\\n4. 👥 Instructions for participants:\\n\\n5. 📎 Extra context / notes:\\n";
                        handleChange(key, template);
                      }}
                      className="mt-3 w-full bg-white border border-primary/20 text-primary hover:bg-primary hover:text-white font-medium py-2 rounded-lg transition-colors text-[13px] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Use this template
                    </button>
                  </div>
                )}
"""

# I need to insert this right after the conversational question block.
search_pattern = r"(\{\/\* The conversational question \*\/\}.*?<\/p>)"
replacement = r"\1\n" + helper_block_new

new_content = re.sub(search_pattern, replacement, content, flags=re.DOTALL)

with open('frontend/src/components/IntentBlockRenderer.jsx', 'w') as f:
    f.write(new_content)
