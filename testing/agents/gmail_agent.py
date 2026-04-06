"""Gmail specialist sub-agent."""

import re
from typing import Any

from google.adk import Agent
from google.adk.agents.context import Context
from google.adk.tools import BaseTool
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset

from ..tools.fix_tool_names import make_fix_tool_names_callback

# Patterns that indicate a hallucinated / placeholder email address
_PLACEHOLDER_PATTERNS = re.compile(
    r"example\.com|test\.com|sample\.com|placeholder|"
    r"johndoe|jane\.doe|yourname|your_email|user@email|"
    r"recipient@|sender@email",
    re.IGNORECASE,
)


def _looks_like_real_email(address: str) -> bool:
    """Return False if the address looks like a placeholder."""
    if not address or "@" not in address:
        return False
    if _PLACEHOLDER_PATTERNS.search(address):
        return False
    return True


def _validate_send_args(
    tool: BaseTool, args: dict[str, Any], context: Context
) -> dict | None:
    """Block gmail.send / gmail.createDraft when the recipient looks fake."""
    tool_name = getattr(tool, "name", "") or ""
    if tool_name not in ("gmail.send", "gmail.createDraft"):
        return None  # allow all other tools through

    to_field = args.get("to", "")
    recipients = [to_field] if isinstance(to_field, str) else (to_field or [])
    bad = [r for r in recipients if not _looks_like_real_email(r)]

    if bad:
        return {
            "error": (
                f"Blocked: recipient address(es) {bad} look like placeholders. "
                "Please ask the user for their real email address before sending."
            )
        }
    return None  # allow the call through


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
        "You are a Gmail expert for Agent47.\n\n"
        "=== TOOLS (always use FULL dotted name) ===\n"
        "  gmail.search, gmail.get, gmail.downloadAttachment, gmail.modify,\n"
        "  gmail.batchModify, gmail.modifyThread, gmail.send, gmail.createDraft,\n"
        "  gmail.sendDraft, gmail.listLabels, gmail.createLabel\n\n"
        "CRITICAL: Every tool call MUST start with 'gmail.' — bare names like 'search' will fail.\n\n"
        "=== EMAIL COMPOSE / SEND WORKFLOW ===\n\n"
        "RULE 1 — Gather exactly three things in ONE message.\n"
        "  Before composing, you need:\n"
        "    1. To   — the recipient's real email address\n"
        "    2. Reason — the purpose / main points of the email\n"
        "    3. Nickname — what to call the recipient (e.g. 'John', 'Dr. Smith')\n"
        "  If ANY of these are missing from the user's message, ask for ALL missing ones\n"
        "  in a single, numbered question list. NEVER send multiple separate questions.\n"
        "  If all three are already present, skip straight to RULE 2.\n"
        "  NEVER ask for subject or body text separately — derive them from reason + nickname.\n\n"
        "RULE 2 — Compose a PREVIEW, never send immediately.\n"
        "  Once you have to + reason + nickname, compose the full email in a formal-but-friendly\n"
        "  style (plain text, opens 'Dear <nickname>,' closes 'Best regards') and show a\n"
        "  preview block: To / Subject / Body.\n"
        "  End with: \"Send this? Reply yes to send, or tell me what to change.\"\n"
        "  NEVER call gmail.send or gmail.createDraft before the user confirms.\n\n"
        "RULE 3 — Send on confirmation.\n"
        "  When the user says yes (or ok / send it / looks good), call gmail.send.\n"
        "  Use the EXACT recipient email from the conversation — never invent one.\n"
        "  (Use gmail.createDraft instead if they asked to save as draft.)\n\n"
        "=== OTHER RULES ===\n"
        "  - Search/read/label requests: execute directly, no style question needed.\n"
        "  - Return concise summaries to the orchestrator."
    ),
        tools=[workspace_mcp],
        before_tool_callback=_validate_send_args,
        after_model_callback=make_fix_tool_names_callback("gmail"),
    )
