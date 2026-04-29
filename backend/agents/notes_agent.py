"""Notes specialist sub-agent.

Manages personal notes stored in the local SQLite database.
"""

from google.adk import Agent

from ..tools.database import create_note, search_notes, update_note, delete_note

notes_agent = Agent(
    model="gemini-2.5-flash",
    name="notes_agent",
    description=(
        "Notes manager. Creates, searches, updates, and deletes personal notes "
        "stored in the local database."
    ),
    instruction=(
        "You are a notes management specialist.\n"
        "- Use create_note to save new notes. Capture title, content, and optional "
        "comma-separated tags (e.g., 'work,meeting,q2').\n"
        "- Use search_notes to find notes by keyword or tag. "
        "Call with no arguments to list all notes.\n"
        "- Use update_note to edit an existing note's title, content, or tags. "
        "Only update the fields the user explicitly mentions.\n"
        "- Use delete_note to remove a note. Always confirm the note title before deleting.\n"
        "Return a clear, formatted summary to the orchestrator."
    ),
    tools=[create_note, search_notes, update_note, delete_note],
)
