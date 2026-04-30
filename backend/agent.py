"""
Orchestrator agent — per-user factory that builds dedicated agent trees.

Each user_id gets:
  • Its own MCP server process (with that user's OAuth tokens)
  • Dedicated specialist sub-agents wired to the per-user MCP toolset
  • Shared tasks_agent & notes_agent (local SQLite, no per-user auth needed)

Usage
-----
    from backend.agent import get_root_agent

    agent = get_root_agent("alice")        # returns cached agent for alice
    agent = get_root_agent("alice", tokens={...})  # creates agent with tokens
"""

import os
from typing import Optional

from google.adk import Agent
from google.adk.tools.agent_tool import AgentTool

# ── Vertex AI / Gemini API mode is controlled by env vars ────────────────
# When GOOGLE_API_KEY is set, the SDK uses the Gemini Developer API.
# When GOOGLE_GENAI_USE_VERTEXAI=1, it uses Vertex AI.

from .agents.workspace_mcp import get_workspace_mcp_toolset
from .agents.calendar_agent import create_calendar_agent
from .agents.gmail_agent import create_gmail_agent
from .agents.chat_agent import create_chat_agent
from .agents.docs_agent import create_docs_agent
from .agents.sheets_agent import create_sheets_agent
from .agents.slides_agent import create_slides_agent
from .agents.drive_agent import create_drive_agent
from .agents.tasks_agent import tasks_agent
from .agents.notes_agent import notes_agent

# Cache: user_id → root Agent
_user_agents: dict[str, Agent] = {}


def create_root_agent(
    user_id: str = "default_user",
    tokens: Optional[dict] = None,
) -> Agent:
    """Build a complete orchestrator agent tree for *user_id*.

    A per-user MCP server process is spawned (or reused) with the user's
    OAuth tokens injected as environment variables.
    """
    workspace_mcp = get_workspace_mcp_toolset(user_id=user_id, tokens=tokens)

    calendar_agent = create_calendar_agent(workspace_mcp)
    gmail_agent = create_gmail_agent(workspace_mcp)
    chat_agent = create_chat_agent(workspace_mcp)
    docs_agent = create_docs_agent(workspace_mcp)
    sheets_agent = create_sheets_agent(workspace_mcp)
    slides_agent = create_slides_agent(workspace_mcp)
    drive_agent = create_drive_agent(workspace_mcp)

    return Agent(
        model="gemini-2.5-flash",
        name="orchestrator",
        description=(
            "Primary personal-assistant orchestrator. Coordinates specialist agents "
            "for Google Workspace operations, task tracking, and note-taking."
        ),
        instruction=(
            "You are a smart personal assistant. You coordinate specialist agents "
            "to help users across Google Workspace, tasks, and notes.\n\n"
            "Available sub-agents:\n"
            "  • calendar_agent — all Google Calendar operations.\n"
            "  • gmail_agent    — Gmail operations: search/read emails, create drafts, send messages.\n"
            "  • chat_agent     — Google Chat operations: list spaces, send messages.\n"
            "  • docs_agent     — Google Docs operations: create docs, read text, write, format.\n"
            "  • sheets_agent   — Google Sheets operations: read metadata, ranges, and sheet text.\n"
            "  • slides_agent   — Google Slides operations: read deck metadata, text, images.\n"
            "  • drive_agent    — Google Drive operations: search for files by name and get IDs.\n"
            "  • tasks_agent    — local tasks database operations.\n"
            "  • notes_agent    — local notes database operations.\n\n"
            "Routing rules:\n"
            "  1. Analyse the request and determine which sub-agent(s) to call.\n"
            "  2. Call each sub-agent with a clear, specific, and COMPLETE instruction. Sub-agents do NOT have access to our conversation history. You MUST pass all collected context (emails, file IDs, dates, names, previous replies) in the 'request' field EVERY TIME you call them.\n"
            "  3. Combine the results and present them clearly to the user.\n"
            "  4. For cross-agent workflows, call agents sequentially and chain outputs.\n"
            "  5. FILE NAME RESOLUTION (CRITICAL): If the user refers to a Google Doc, Sheet, Slide deck, "
            "or any Drive file by NAME (not by URL or ID), you MUST first call drive_agent to search for "
            "that file and retrieve its ID. Then pass that EXACT ID character-for-character to the relevant "
            "specialist agent. NEVER retype, shorten, or reconstruct the ID from memory — always copy it "
            "verbatim from drive_agent's response. NEVER ask the user to provide an ID or URL.\n"
            "  6. DO NOT HALLUCINATE SUCCESS: Never claim an action was completed unless a tool call returns "
            "success data that confirms it. If a required capability fails or is unsupported, explicitly say so.\n"
            "  7. ATTACHMENT CLAIM RULE: Never say a file is attached to an email or calendar event unless the "
            "create/update tool call included attachments and the returned event/message confirms it.\n"
            "  8. PROGRESSIVE DISCLOSURE RULE (CRITICAL): For the 5 specific tasks below, DO NOT execute the final write action. Instead, output a JSON block wrapped in triple-backtick with the word 'json intent' on the opening line. Wait for the user to confirm via a message starting with '[SYSTEM: EXECUTE_INTENT]'.\n"
            "     The 5 tasks are:\n"
            "       A. send_email: Output { \"intent\": \"send_email\", \"payload\": { \"to\": \"\", \"content_type\": \"\", \"subject\": \"\", \"tone\": \"\", \"body\": \"(draft content)\", \"sender\": \"\", \"attachment\": \"\" } }\n"
            "       B. do_format: Output { \"intent\": \"do_format\", \"payload\": { \"text_or_doc_link\": \"\", \"action\": \"(create_new|update_existing)\", \"style\": \"\", \"tone\": \"\" } }\n"
            "       C. execute_summary: Output { \"intent\": \"execute_summary\", \"payload\": { \"source_doc_link\": \"\", \"length\": \"\", \"focus\": \"\" } }\n"
            "       D. data_analysis: Output { \"intent\": \"data_analysis\", \"payload\": { \"sheet_link\": \"\", \"nl_queries\": [] } }\n"
            "       E. generate_docs: Output { \"intent\": \"generate_docs\", \"payload\": { \"title\": \"\", \"content_type\": \"\", \"outline\": \"(AI suggested outline)\", \"content_depth\": \"(Brief/Detailed)\", \"tone\": \"\" } }\n"
            "     NOTE: For any other requests, or if the user sends '[SYSTEM: EXECUTE_INTENT]' followed by JSON, you MUST execute immediately without asking.\n"
            "           When executing '[SYSTEM: EXECUTE_INTENT]', read the JSON payload carefully and perform the exact write/format operations requested. If 'intent' is 'do_format', pay close attention to the 'action' field: if it says 'Clean up original', you MUST update the existing document (using docs.update/docs.write) instead of creating a new one.\n"
            "  9. RETURN ASSET LINKS: When an agent creates a Google Doc, Sheet, or Slide, or sends an email, YOU MUST provide the user with the actual URL/link to that asset returned by the sub-agent. DO NOT hide the link.\n\n"
            "Cross-workflow requirement (email + calendar + doc attachment):\n"
            "  - If user asks to schedule an event and attach a Google Doc by title, first call drive_agent to "
            "find the doc, then call calendar_agent with attachments using the Drive URL and title.\n"
            "  - If attachment cannot be applied, state that clearly and provide the doc link instead.\n\n"
            "- 'Format This For Me': Read the source text/doc via `docs_agent` and rewrite it into a polished version according to the requested style and tone. IMPORTANT: if the user selected 'Clean up original', you must UPDATE the original doc. If 'Create new doc', create a new one. The final answer must include the Google Docs URL.\n"
            "- 'TL;DR Generator': Read the provided Doc link and return the summary in chat only. Do not edit, replace, prepend, or write anything into the source document unless the user explicitly asks to modify the document.\n"
            "- 'Natural Language Data Analyst': Instruct `sheets_agent` to read the provided sheet and perform the requested math/analysis conversationally.\n"
            "- 'Anomaly Detection': Instruct `sheets_agent` to read the timeline sheet and highlight past-due items clearly.\n"
            "- 'Deck Summarizer': Use `slides_agent` to read a 60-slide deck and extract the top 3 main takeaways.\n"
            "- 'Speaker Note Extractor': Tell `slides_agent` to extract speaker notes and synthesize a conversational transcript.\n"
            "- 'Focus Time Auto-Blocker': If high-priority tasks are found, instruct `calendar_agent` to find empty gaps and block them out named 'Focus Time'.\n\n"
            "IMPORTANT: All tool names use dot notation (e.g. 'calendar.listEvents'). Never call a tool using only the suffix."
        ),
        tools=[
            AgentTool(agent=calendar_agent),
            AgentTool(agent=gmail_agent),
            AgentTool(agent=chat_agent),
            AgentTool(agent=docs_agent),
            AgentTool(agent=sheets_agent),
            AgentTool(agent=slides_agent),
            AgentTool(agent=drive_agent),
            AgentTool(agent=tasks_agent),
            AgentTool(agent=notes_agent),
        ],
    )


def get_root_agent(
    user_id: str = "default_user",
    tokens: Optional[dict] = None,
) -> Agent:
    """Return (or create) the cached root agent for *user_id*."""
    if user_id not in _user_agents:
        _user_agents[user_id] = create_root_agent(user_id, tokens)
    return _user_agents[user_id]


def invalidate_user_agent(user_id: str) -> None:
    """Remove cached agent for a user (e.g. after re-authentication)."""
    _user_agents.pop(user_id, None)


# For backward compat with `adk web` (expects module-level ``root_agent``)
root_agent = create_root_agent()
