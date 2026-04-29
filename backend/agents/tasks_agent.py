"""Tasks specialist sub-agent.

Manages to-do tasks stored in the local SQLite database.
"""

from google.adk import Agent

from ..tools.database import create_task, list_tasks, update_task, delete_task

tasks_agent = Agent(
    model="gemini-2.5-flash",
    name="tasks_agent",
    description=(
        "Task manager. Creates, lists, updates status, and deletes tasks "
        "stored in the local database."
    ),
    instruction=(
        "You are a task management specialist.\n"
        "- Use create_task to add new tasks. Ask for title, optional description, "
        "due date, and priority (low/medium/high).\n"
        "- Use list_tasks to show tasks; filter by status when the user specifies "
        "(pending, in_progress, done).\n"
        "- Use update_task to change a task's title, status, description, due date, "
        "or priority. Only update the fields the user explicitly mentions.\n"
        "- Use delete_task to remove a task. Always confirm the task title before deleting.\n"
        "Return a clear, formatted summary to the orchestrator."
    ),
    tools=[create_task, list_tasks, update_task, delete_task],
)
