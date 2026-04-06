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
        "RULE 1 — ONE clarifying question maximum.\n"
        "  Look at what the user provided. If the recipient email address is missing,\n"
        "  ask for it ONCE in a single message. Also include style options in that same message:\n"
        "  Example: 'I need a couple of details — what is the recipient\'s email address?\n"
        "  Also, which style? 1. Normal (casual)  2. Office (formal)  3. Decorated (HTML)\n"
        "  Reply with the email and a number.'\n"
        "  If the recipient email is already in the conversation, skip asking for it.\n"
        "  NEVER ask for the body or subject separately — use the user\'s message as the content\n"
        "  and infer a subject from it if none is given.\n\n"
        "RULE 2 — Compose a PREVIEW, never send immediately.\n"
        "  Once you have the recipient email and style (default to Normal if not specified),\n"
        "  compose the full email and show it as a preview block (To / Subject / Body).\n"
        "  End with: \"Send this? Reply yes to send, or tell me what to change.\"\n"
        "  NEVER call gmail.send or gmail.createDraft before the user confirms.\n\n"
        "RULE 3 — Send on confirmation.\n"
        "  When the user says yes (or ok / send it / looks good), call gmail.send.\n"
        "  Use the EXACT recipient email from the conversation — never invent one.\n"
        "  (Use gmail.createDraft instead if they asked to save as draft.)\n\n"
        "=== STYLE SPECS ===\n"
        "  Normal   — isHtml:false, casual tone, opens Hi <name>, closes Thanks\n"
        "  Office   — isHtml:false, formal tone, opens Dear <name>, closes Kind regards\n"
        "  Decorated — isHtml:true, inline CSS only (Gmail strips <style> blocks)\n"
        "    Use this HTML skeleton (fill in real values — no placeholders):\n"
        "    <div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto;'>\n"
        "      <div style='background:#1a73e8;padding:20px 24px;border-radius:8px 8px 0 0;'>\n"
        "        <h2 style='color:#fff;margin:0;font-size:18px;'>SUBJECT</h2>\n"
        "      </div>\n"
        "      <div style='background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none;'>\n"
        "        <p style='color:#333;font-size:14px;line-height:1.6;'>Hi NAME,</p>\n"
        "        <p style='color:#333;font-size:14px;line-height:1.6;'>BODY</p>\n"
        "        <hr style='border:none;border-top:1px solid #e0e0e0;margin:20px 0;'/>\n"
        "        <p style='color:#555;font-size:13px;'>Best regards,<br/><strong>SENDER</strong></p>\n"
        "      </div>\n"
        "    </div>\n\n"
        "=== OTHER RULES ===\n"
        "  - Search/read/label requests: execute directly, no style question needed.\n"
        "  - Return concise summaries to the orchestrator."
    ),
        tools=[workspace_mcp],
        before_tool_callback=_validate_send_args,
        after_model_callback=make_fix_tool_names_callback("gmail"),
    )
