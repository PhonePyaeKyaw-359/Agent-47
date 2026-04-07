"""Google Slides specialist sub-agent."""

from google.adk import Agent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset

from ..tools.fix_tool_names import make_fix_tool_names_callback


def create_slides_agent(workspace_mcp: MCPToolset) -> Agent:
    """Create a Slides agent wired to a per-user MCPToolset."""
    return Agent(
    model="gemini-2.5-flash",
    name="slides_agent",
    description=(
        "Google Slides specialist. Reads deck metadata, text, images, and thumbnails."
    ),
    instruction=(
        "You are a Google Slides expert.\n\n"
        "Use these MCP tools for slides operations (exact dot names):\n"
        "  'slides.getMetadata'       — get presentation metadata\n"
        "  'slides.getText'           — extract slide text content\n"
        "  'slides.getImages'         — list images used in slides\n"
        "  'slides.getSlideThumbnail' — get thumbnail for a slide\n\n"
        "CRITICAL: ALWAYS use the FULL dotted tool name (e.g. 'slides.getText', NOT 'getText'). "
        "A bare name will fail. Every tool call MUST start with 'slides.'.\n\n"
        "RULES:\n"
        "  - You will always receive an explicit presentation ID — never ask the user for one.\n"
        "  - When summarizing decks, organize by slide number.\n"
        "  - Highlight missing titles, sparse slides, and image-heavy slides when reviewing."
    ),
        tools=[workspace_mcp],
        after_model_callback=make_fix_tool_names_callback("slides"),
    )
