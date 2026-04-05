"""Google Sheets specialist sub-agent."""

from google.adk import Agent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset

from ..tools.fix_tool_names import make_fix_tool_names_callback


def create_sheets_agent(workspace_mcp: MCPToolset) -> Agent:
    """Create a Sheets agent wired to a per-user MCPToolset."""
    return Agent(
    model="gemini-2.5-flash",
    name="sheets_agent",
    description=(
        "Google Sheets specialist. Reads sheet metadata, ranges, and table text."
    ),
    instruction=(
        "You are a Google Sheets expert.\n\n"
        "Use these MCP tools for sheets operations (exact dot names):\n"
        "  'sheets.getMetadata'  — get spreadsheet structure/sheet info\n"
        "  'sheets.getRange'     — read a specific A1 range\n"
        "  'sheets.getText'      — read sheet/table text content\n\n"
        "CRITICAL: ALWAYS use the FULL dotted tool name (e.g. 'sheets.getRange', NOT 'getRange'). "
        "A bare name will fail. Every tool call MUST start with 'sheets.'.\n\n"
        "RULES:\n"
        "  - Ask for spreadsheet ID and range if not provided for range-specific requests.\n"
        "  - Keep numeric values and headers aligned in your response table.\n"
        "  - Return concise summaries, emphasizing totals and anomalies when relevant."
    ),
        tools=[workspace_mcp],
        after_model_callback=make_fix_tool_names_callback("sheets"),
    )
