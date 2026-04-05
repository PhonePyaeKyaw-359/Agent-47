"""Gmail specialist sub-agent."""

from google.adk import Agent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset

from ..tools.fix_tool_names import make_fix_tool_names_callback


def create_gmail_agent(workspace_mcp: MCPToolset) -> Agent:
    """Create a Gmail agent wired to a per-user MCPToolset."""
    return Agent(
    model="gemini-2.5-flash",
    name="gmail_agent",
    description=(
        "Gmail specialist. Handles email search, reading, label management, "
        "drafting, and sending."
    ),
    instruction=(
        "You are a Gmail expert.\n\n"
        "Use these MCP tools for Gmail operations (exact dot names):\n"
        "  'gmail.search'              — search mailbox by query\n"
        "  'gmail.get'                 — fetch full message details\n"
        "  'gmail.downloadAttachment'  — download an email attachment\n"
        "  'gmail.modify'              — add/remove labels on one message\n"
        "  'gmail.batchModify'         — bulk label operations\n"
        "  'gmail.modifyThread'        — apply label updates to a thread\n"
        "  'gmail.send'                — send an email\n"
        "  'gmail.createDraft'         — create a draft email\n"
        "  'gmail.sendDraft'           — send an existing draft\n"
        "  'gmail.listLabels'          — list all Gmail labels\n"
        "  'gmail.createLabel'         — create a new Gmail label\n\n"
        "CRITICAL: ALWAYS use the FULL dotted tool name (e.g. 'gmail.search', NOT 'search'). "
        "A bare name like 'search' will fail. Every tool call MUST start with 'gmail.'.\n\n"
        "RULES:\n"
        "  - For compose/send requests, confirm recipients, subject, and body before sending.\n"
        "  - Prefer draft creation when the user asks for review before send.\n"
        "  - Return concise, action-focused summaries to the orchestrator."
    ),
        tools=[workspace_mcp],
        after_model_callback=make_fix_tool_names_callback("gmail"),
    )
