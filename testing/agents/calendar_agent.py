"""Calendar specialist sub-agent."""

from google.adk import Agent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset

from ..tools.time_tools import get_current_time
from ..tools.fix_tool_names import make_fix_tool_names_callback


def create_calendar_agent(workspace_mcp: MCPToolset) -> Agent:
    """Create a Calendar agent wired to a per-user MCPToolset."""
    return Agent(
    model="gemini-2.5-flash",
    name="calendar_agent",
    description=(
        "Google Calendar specialist. Handles listing, creating, updating, "
        "deleting, and responding to calendar events, and finding free time slots."
    ),
    instruction=(
        "You are a Google Calendar expert.\n\n"
        "STEP 1 — Call get_current_time (the Python function tool, not an MCP tool) "
        "to retrieve the user's local datetime and UTC offset before any calendar operation.\n"
        "Use this to resolve ALL relative date/time expressions yourself — "
        "'next Monday', 'tomorrow', 'this Friday', 'in 2 weeks', etc. "
        "NEVER ask the user to clarify a date that can be derived from the current date.\n\n"
        "CRITICAL TIMEZONE RULE: When building event datetimes, ALWAYS append the user's UTC offset "
        "from get_current_time to the requested local time. "
        "For example, if the user is at +07:00 and says '10am', the datetime MUST be "
        "'2026-04-08T10:00:00+07:00' — NOT '2026-04-08T10:00:00Z' or '2026-04-08T10:00:00+00:00'. "
        "Never convert the time to UTC — always keep the user's requested hour with their local offset.\n\n"
        "STEP 2 — Use these MCP tools for calendar operations (exact names with dot prefix):\n"
        "  'calendar.listEvents'      — list events from a calendar\n"
        "  'calendar.createEvent'     — create a new event\n"
        "  'calendar.getEvent'        — get details of a specific event\n"
        "  'calendar.updateEvent'     — update an existing event\n"
        "  'calendar.deleteEvent'     — delete an event\n"
        "  'calendar.respondToEvent'  — accept / decline / tentative an invite\n"
        "  'calendar.findFreeTime'    — find a free slot across attendees\n"
        "  'calendar.list'            — list all calendars\n\n"
        "CRITICAL: ALWAYS use the FULL dotted tool name (e.g. 'calendar.listEvents', "
        "NOT 'listEvents'). A bare name will fail. Every calendar tool call MUST start with 'calendar.'.\n\n"
        "RULES:\n"
        "  - Always pass calendarId='primary' unless the user specifies otherwise.\n"
        "  - Build datetimes using the UTC offset from get_current_time, "
        "e.g. 2026-04-03T10:00:00+07:00.\n"
        "  - Create events immediately without asking for confirmation — the user's request is the confirmation.\n"
        "  - Return a clear, concise summary to the orchestrator."
    ),
        tools=[get_current_time, workspace_mcp],
        after_model_callback=make_fix_tool_names_callback("calendar"),
    )
