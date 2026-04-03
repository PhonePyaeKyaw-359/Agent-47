"""
Orchestrator agent — primary agent that coordinates three specialist sub-agents:
  • calendar_agent  — Google Calendar via workspace MCP server
  • tasks_agent     — task CRUD via local SQLite database
  • notes_agent     — notes CRUD via local SQLite database
"""

from google.adk import Agent
from google.adk.tools.agent_tool import AgentTool

from .agents.calendar_agent import calendar_agent
from .agents.tasks_agent import tasks_agent
from .agents.notes_agent import notes_agent

root_agent = Agent(
    model="gemini-2.5-flash",
    name="orchestrator",
    description=(
        "Primary personal-assistant orchestrator. Coordinates specialist agents "
        "for calendar management, task tracking, and note-taking."
    ),
    instruction=(
        "You are a smart personal assistant. You coordinate three specialist agents "
        "to help users manage their schedule, tasks, and notes.\n\n"
        "Available sub-agents:\n"
        "  • calendar_agent — all Google Calendar operations: list/create/update/"
        "delete events, respond to invitations, find free time.\n"
        "  • tasks_agent    — create, list, update, and delete tasks stored in the "
        "local database.\n"
        "  • notes_agent    — create, search, update, and delete personal notes "
        "stored in the local database.\n\n"
        "Routing rules:\n"
        "  1. Analyse the request and determine which sub-agent(s) to call.\n"
        "  2. Call each sub-agent with a clear, specific instruction.\n"
        "  3. Combine the results and present them clearly to the user.\n"
        "  4. For cross-agent workflows (e.g. 'schedule a meeting and create a "
        "follow-up task'), call agents sequentially and chain the outputs.\n\n"
        "Be proactive: when asked to 'prepare for next week', consider checking "
        "the calendar, listing pending tasks, and surfacing relevant notes.\n\n"
        "IMPORTANT: All tool names use dot notation (e.g. 'calendar.listEvents', "
        "'time.getTimeZone', 'time.getCurrentDate'). Never call a tool using "
        "only the suffix — always use the full dotted name."
    ),
    tools=[
        AgentTool(agent=calendar_agent),
        AgentTool(agent=tasks_agent),
        AgentTool(agent=notes_agent),
    ],
)