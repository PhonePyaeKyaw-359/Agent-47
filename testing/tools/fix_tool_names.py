"""after_model_callback that rewrites bare tool names to their dotted equivalents.

When the LLM hallucinates a bare name like ``search`` instead of
``gmail.search``, this callback patches the function-call name in the
LlmResponse *before* the framework tries to dispatch it, preventing the
"Tool not found" ValueError.
"""

from __future__ import annotations

import logging
from typing import Optional

from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_response import LlmResponse

logger = logging.getLogger(__name__)

# ── All dotted tool names served by the Workspace MCP server ──────────────
_ALL_TOOLS: list[str] = [
    "auth.clear",
    "auth.refreshToken",
    "calendar.createEvent",
    "calendar.deleteEvent",
    "calendar.findFreeTime",
    "calendar.getEvent",
    "calendar.list",
    "calendar.listEvents",
    "calendar.respondToEvent",
    "calendar.updateEvent",
    "chat.findDmByEmail",
    "chat.findSpaceByName",
    "chat.getMessages",
    "chat.listSpaces",
    "chat.listThreads",
    "chat.sendDm",
    "chat.sendMessage",
    "chat.setUpSpace",
    "docs.create",
    "docs.formatText",
    "docs.getSuggestions",
    "docs.getText",
    "docs.replaceText",
    "docs.writeText",
    "drive.createFolder",
    "drive.downloadFile",
    "drive.findFolder",
    "drive.getComments",
    "drive.moveFile",
    "drive.renameFile",
    "drive.search",
    "drive.trashFile",
    "gmail.batchModify",
    "gmail.createDraft",
    "gmail.createLabel",
    "gmail.downloadAttachment",
    "gmail.get",
    "gmail.listLabels",
    "gmail.modify",
    "gmail.modifyThread",
    "gmail.search",
    "gmail.send",
    "gmail.sendDraft",
    "people.getMe",
    "people.getUserProfile",
    "people.getUserRelations",
    "sheets.getMetadata",
    "sheets.getRange",
    "sheets.getText",
    "slides.getImages",
    "slides.getMetadata",
    "slides.getSlideThumbnail",
    "slides.getText",
    "time.getCurrentDate",
    "time.getCurrentTime",
    "time.getTimeZone",
]

# suffix → dotted name.  When a suffix is ambiguous (e.g. "search" matches
# both gmail.search and drive.search) it is stored as a *list* so the
# per-agent callback can disambiguate via the agent's namespace prefix.
_SUFFIX_MAP: dict[str, str | list[str]] = {}
for _dotted in _ALL_TOOLS:
    _suffix = _dotted.split(".", 1)[1]
    existing = _SUFFIX_MAP.get(_suffix)
    if existing is None:
        _SUFFIX_MAP[_suffix] = _dotted
    elif isinstance(existing, list):
        existing.append(_dotted)
    else:
        _SUFFIX_MAP[_suffix] = [existing, _dotted]

# Also index by the full dotted name so we can recognise already-correct names
_DOTTED_SET = set(_ALL_TOOLS)


def make_fix_tool_names_callback(
    preferred_prefix: str,
) -> callable:
    """Return an ``after_model_callback`` that fixes bare tool names.

    Args:
        preferred_prefix: The dotted namespace this agent "owns", e.g.
            ``"gmail"`` for the gmail_agent.  Used to disambiguate when a
            bare suffix matches multiple services.
    """

    def fix_tool_names(
        *,
        callback_context: CallbackContext,
        llm_response: LlmResponse,
    ) -> Optional[LlmResponse]:
        if not llm_response.content or not llm_response.content.parts:
            return None

        changed = False
        for part in llm_response.content.parts:
            fc = part.function_call
            if fc is None or fc.name is None:
                continue
            name: str = fc.name

            # Already a known dotted name → nothing to do
            if name in _DOTTED_SET:
                continue

            # Try resolving as a bare suffix
            candidate = _SUFFIX_MAP.get(name)
            if candidate is None:
                # Unknown name – nothing we can fix; let the framework error
                continue

            if isinstance(candidate, list):
                # Ambiguous suffix – pick the one matching our preferred prefix
                matches = [c for c in candidate if c.startswith(preferred_prefix + ".")]
                if matches:
                    resolved = matches[0]
                else:
                    resolved = candidate[0]  # fallback to first
            else:
                resolved = candidate

            logger.warning(
                "Rewrote hallucinated tool name '%s' → '%s'", name, resolved
            )
            fc.name = resolved
            changed = True

        return llm_response if changed else None

    return fix_tool_names
