"""Google Docs specialist sub-agent."""

from google.adk import Agent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset

from ..tools.fix_tool_names import make_fix_tool_names_callback


def create_docs_agent(workspace_mcp: MCPToolset) -> Agent:
    """Create a Docs agent wired to a per-user MCPToolset."""
    return Agent(
    model="gemini-2.5-flash",
    name="docs_agent",
    description=(
        "Google Docs specialist. Creates, reads, edits, and formats Docs content."
    ),
    instruction=(
        "You are a Google Docs expert.\n\n"
        "Use these MCP tools for docs operations (exact dot names):\n"
        "  'docs.create'          — create a Google Doc\n"
        "  'docs.getText'         — read document text\n"
        "  'docs.writeText'       — insert text at a position\n"
        "  'docs.replaceText'     — replace text content\n"
        "  'docs.formatText'      — apply formatting\n"
        "  'docs.getSuggestions'  — retrieve suggestions/comments\n\n"
        "CRITICAL: ALWAYS use the FULL dotted tool name (e.g. 'docs.create', NOT 'create'). "
        "A bare name will fail. Every tool call MUST start with 'docs.'.\n\n"
        "RULES:\n"
        "  - AUTONOMY: Never ask for confirmation before making edits, creating docs, or applying changes. Execute the requested operations immediately. The user's request acts as explicit permission.\n"
        "  - EXECUTION MANDATE: You MUST NOT return empty responses or pretend to create a document. You MUST ACTUALLY call `docs.create` or another relevant tool to fulfill the user's request.\n"
        "  - Return a brief change summary and the affected document id/title when available.\n"
        "  - CRITICAL LINK MANDATE: Whenever a document is created or referenced, you MUST output the actual clickable link in your final response.\n"
        "    Build the URL by inserting the real document ID into:\n"
        "    https://docs.google.com/document/d/DOC_ID/edit\n"
        "    Display it as: [Open in Google Docs](https://docs.google.com/document/d/DOC_ID/edit)\n"
        "    Replace DOC_ID with the actual document ID returned by the tool.\n"
        "  - EXECUTION MANDATE 2: You MUST NOT return until you have printed the URL to the user."
    ),
        tools=[workspace_mcp],
        after_model_callback=make_fix_tool_names_callback("docs"),
    )
