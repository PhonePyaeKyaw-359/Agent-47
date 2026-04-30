"""Gmail specialist sub-agent."""

import re
from typing import Any

from google.adk import Agent
from google.adk.tools import BaseTool
from google.adk.tools.tool_context import ToolContext
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
    tool: BaseTool, args: dict[str, Any], tool_context: ToolContext
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
        "=== FINANCIAL EMAIL ANALYSIS WORKFLOW ===\n\n"
        "When the user asks to analyse transactions, transfers, or spending from a bank:\n"
        "  STEP 1 — Search. Use gmail.search with relevant bank name(s) and financial\n"
        "    keywords (e.g. 'from:krungsri OR subject:krungsri transfer debit credit').\n"
        "    Retrieve up to 20–30 messages with gmail.get for each result.\n"
        "  STEP 2 — Classify each email:\n"
        "    • OUTGOING / DEBIT (user spent): keywords such as 'debit', 'transferred',\n"
        "      'payment', 'withdrawal', 'purchase', 'paid', 'charged', 'you have sent',\n"
        "      'your transfer', 'โอนเงินออก', 'ถอน', 'ชำระ', 'หักบัญชี'\n"
        "    • INCOMING / CREDIT (user received): keywords such as 'credit', 'received',\n"
        "      'deposit', 'you received', 'โอนเงินเข้า', 'รับโอน'\n"
        "    • Ignore promotional / marketing emails with no transaction amount.\n"
        "  STEP 3 — Extract amounts. Parse the numeric amount and currency from each\n"
        "    transaction email. Amounts may appear as '฿1,234.56', 'THB 1,234.56',\n"
        "    '1,234.56 บาท', or similar. Convert commas-as-thousands-separators to floats.\n"
        "  STEP 4 — Sum. Separately total OUTGOING and INCOMING amounts.\n"
        "  STEP 5 — Report. Present a clear summary:\n"
        "    - List each transaction (date, description, amount, type)\n"
        "    - Total outgoing (debit) amount\n"
        "    - Total incoming (credit) amount\n"
        "    - Net balance change\n"
        "  NEVER refuse this task. NEVER say you cannot interpret email content.\n"
        "  ALWAYS perform the full search → parse → sum → report pipeline.\n\n"
        "=== EMAIL COMPOSE / SEND WORKFLOW ===\n\n"
        "RULE 1 — Gather information.\n"
        "  You need the To address, the reason/subject, and the sender name. If any are critically missing, you may ask. Otherwise, deduce them.\n\n"
        "=== OTHER RULES ===\n"
        "  - Search/read/label requests: execute directly, no style question needed.\n"
        "  - Return concise summaries to the orchestrator."
    ),
        tools=[workspace_mcp],
        before_tool_callback=_validate_send_args,
        after_model_callback=make_fix_tool_names_callback("gmail"),
    )
