"""
Orchestrator agent — per-user factory that builds dedicated agent trees.

Each user_id gets:
  • Its own MCP server process (with that user's OAuth tokens)
  • Dedicated specialist sub-agents wired to the per-user MCP toolset
  • Shared tasks_agent & notes_agent (local SQLite, no per-user auth needed)

Usage
-----
    from testing.agent import get_root_agent

    agent = get_root_agent("alice")        # returns cached agent for alice
    agent = get_root_agent("alice", tokens={...})  # creates agent with tokens
"""

from typing import Optional

from google.adk import Agent
from google.adk.tools.agent_tool import AgentTool

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
            "  2. Call each sub-agent with a clear, specific instruction.\n"
            "  3. Combine the results and present them clearly to the user.\n"
            "  4. For cross-agent workflows, call agents sequentially and chain outputs.\n"
            "  5. FILE NAME RESOLUTION (CRITICAL): If the user refers to a Google Doc, Sheet, Slide deck, "
            "or any Drive file by NAME (not by URL or ID), you MUST first call drive_agent to search for "
            "that file and retrieve its ID. Then pass that EXACT ID character-for-character to the relevant "
            "specialist agent. NEVER retype, shorten, or reconstruct the ID from memory — always copy it "
            "verbatim from drive_agent's response. NEVER ask the user to provide an ID or URL.\n\n"
            "### Special Registered Workflows ###\n"
            "When the user requests one of these specific actions, execute the following strict workflows without asking for confirmation unless noted:\n"
            "- 'Inbox Zero Assistant': Instruct `gmail_agent` to fetch the last 100 emails, categorize them into 'Urgent', 'Needs Reply', 'Junk'. Propose drafts for 'Needs Reply' and explicitly ask the user if they want to archive the junk.\n"
            "- 'Bill & Subscription Extractor': Instruct `gmail_agent` to search for receipts/invoices, calculate monthly spend, and draft a summary email to the user.\n"
            "- 'Format This For Me': Use `docs_agent` to create a beautifully formatted Google Doc (H1, H2, bullets) from the provided chaotic text.\n"
            "- 'TL;DR Generator': Read the provided Doc link via `docs_agent`, summarize it into a 1-page executive summary, and write it at the top of the doc.\n"
            "- 'Natural Language Data Analyst': Instruct `sheets_agent` to read the provided sheet and perform the requested math/analysis conversationally.\n"
            "- 'Anomaly Detection': Instruct `sheets_agent` to read the timeline sheet and highlight past-due items clearly.\n"
            "- 'Deck Summarizer': Use `slides_agent` to read a 60-slide deck and extract the top 3 main takeaways.\n"
            "- 'Speaker Note Extractor': Tell `slides_agent` to extract speaker notes and synthesize a conversational transcript.\n"
            "- 'Contextual Meeting Creation': Search context via memory or `gmail_agent`, then use `calendar_agent` to schedule the meeting and add the extracted context/Docs natively to the Calendar description.\n"
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