"""Google Drive specialist sub-agent."""

from google.adk import Agent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset

from ..tools.fix_tool_names import make_fix_tool_names_callback


def create_drive_agent(workspace_mcp: MCPToolset) -> Agent:
    """Create a Drive agent wired to a per-user MCPToolset."""
    return Agent(
        model="gemini-2.5-flash",
        name="drive_agent",
        description=(
            "Google Drive specialist. Searches for files, folders, and retrieves file IDs by name."
        ),
        instruction=(
            "You are a Google Drive expert.\n\n"
            "Use these MCP tools for drive operations (exact dot names):\n"
            "  'drive.search'       — searches for files and folders by name or query\n\n"
            "CRITICAL: ALWAYS use the FULL dotted tool name (e.g. 'drive.search', NOT 'search'). "
            "A bare name will fail. Every tool call MUST start with 'drive.'.\n\n"
            "RULES:\n"
            "  - When a user provides a file name instead of a URL or ID, use drive.search to find the ID.\n"
            "  - Return the file ID so that it can be used by other agents (like slides_agent or docs_agent)."
        ),
        tools=[workspace_mcp],
        after_model_callback=make_fix_tool_names_callback("drive"),
    )
