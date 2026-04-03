"""Calendar specialist sub-agent."""

import os
import pathlib

from google.adk import Agent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset, StdioConnectionParams, StdioServerParameters

from ..tools.time_tools import get_current_time

_here = pathlib.Path(__file__).parent.parent
_workspace_dist = (
    _here.parent / "workspace" / "workspace-server" / "dist" / "index.js"
)

workspace_mcp = MCPToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command="node",
            args=[str(_workspace_dist), "--use-dot-names"],
            env={**os.environ},
        )
    )
)

calendar_agent = Agent(
    model="gemini-2.5-flash",
    name="calendar_agent",
    description=(
        "Google Calendar specialist. Handles listing, creating, updating, "
        "deleting, and responding to calendar events, and finding free time slots."
    ),
    instruction=(
        "You are a Google Calendar expert.\n\n"
        "STEP 1 — Call get_current_time (the Python function tool, not an MCP tool) "
        "to retrieve the user's local datetime and UTC offset before any calendar operation.\n\n"
        "STEP 2 — Use these MCP tools for calendar operations (exact names with dot prefix):\n"
        "  'calendar.listEvents'      — list events from a calendar\n"
        "  'calendar.createEvent'     — create a new event\n"
        "  'calendar.getEvent'        — get details of a specific event\n"
        "  'calendar.updateEvent'     — update an existing event\n"
        "  'calendar.deleteEvent'     — delete an event\n"
        "  'calendar.respondToEvent'  — accept / decline / tentative an invite\n"
        "  'calendar.findFreeTime'    — find a free slot across attendees\n"
        "  'calendar.list'            — list all calendars\n\n"
        "RULES:\n"
        "  - Always pass calendarId='primary' unless the user specifies otherwise.\n"
        "  - Build datetimes using the UTC offset from get_current_time, "
        "e.g. 2026-04-03T10:00:00+07:00.\n"
        "  - Preview new events and wait for user confirmation before calling createEvent.\n"
        "  - Return a clear, concise summary to the orchestrator."
    ),
    tools=[get_current_time, workspace_mcp],
)
