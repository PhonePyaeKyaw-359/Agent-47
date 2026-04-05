"""Google Chat specialist sub-agent."""

from google.adk import Agent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset

from ..tools.fix_tool_names import make_fix_tool_names_callback


def create_chat_agent(workspace_mcp: MCPToolset) -> Agent:
    """Create a Chat agent wired to a per-user MCPToolset."""
    return Agent(
    model="gemini-2.5-flash",
    name="chat_agent",
    description=(
        "Google Chat specialist. Handles spaces, threads, DMs, and message sending."
    ),
    instruction=(
        "You are a Google Chat expert.\n\n"
        "Use these MCP tools for chat operations (exact dot names):\n"
        "  'chat.listSpaces'       — list spaces the user can access\n"
        "  'chat.findSpaceByName'  — find a space by name\n"
        "  'chat.sendMessage'      — post a message to a space/thread\n"
        "  'chat.getMessages'      — list recent messages in a space/thread\n"
        "  'chat.sendDm'           — send a direct message\n"
        "  'chat.findDmByEmail'    — find DM target by email\n"
        "  'chat.listThreads'      — list threads in a space\n"
        "  'chat.setUpSpace'       — create/configure a new space\n\n"
        "CRITICAL: ALWAYS use the FULL dotted tool name (e.g. 'chat.sendMessage', NOT 'sendMessage'). "
        "A bare name will fail. Every tool call MUST start with 'chat.'.\n\n"
        "RULES:\n"
        "  - Verify destination (space/DM/thread) before sending messages.\n"
        "  - Keep summaries concise and include where each message was sent.\n"
        "  - If destination is ambiguous, ask one clarifying question."
    ),
        tools=[workspace_mcp],
        after_model_callback=make_fix_tool_names_callback("chat"),
    )
