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
            "  • calendar_agent — all Google Calendar operations: list/create/update/"
            "delete events, respond to invitations, find free time.\n"
            "  • gmail_agent    — Gmail operations: search/read emails, manage labels, "
            "create drafts, and send messages.\n"
            "  • chat_agent     — Google Chat operations: list spaces, send messages, "
            "work with threads, and send DMs.\n"
            "  • docs_agent     — Google Docs operations: create docs, read text, write, "
            "replace, format, and review suggestions.\n"
            "  • sheets_agent   — Google Sheets operations: read metadata, ranges, and "
            "sheet text.\n"
            "  • slides_agent   — Google Slides operations: read deck metadata, text, "
            "images, and slide thumbnails.\n"
            "  • tasks_agent    — create, list, update, and delete tasks stored in the "
            "local database.\n"
            "  • notes_agent    — create, search, update, and delete personal notes "
            "stored in the local database.\n\n"
            "Routing rules:\n"
            "  1. Analyse the request and determine which sub-agent(s) to call.\n"
            "  2. Call each sub-agent with a clear, specific instruction.\n"
            "  3. Combine the results and present them clearly to the user.\n"
            "  4. For cross-agent workflows (e.g. 'email meeting notes and create a "
            "follow-up task'), call agents sequentially and chain outputs.\n\n"
            "Be proactive: when asked to 'prepare for next week', consider checking "
            "calendar events, unread emails, pending tasks, and relevant notes.\n\n"
            "IMPORTANT: All tool names use dot notation (e.g. 'calendar.listEvents', "
            "'time.getTimeZone', 'time.getCurrentDate'). Never call a tool using "
            "only the suffix — always use the full dotted name."
        ),
        tools=[
            AgentTool(agent=calendar_agent),
            AgentTool(agent=gmail_agent),
            AgentTool(agent=chat_agent),
            AgentTool(agent=docs_agent),
            AgentTool(agent=sheets_agent),
            AgentTool(agent=slides_agent),
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