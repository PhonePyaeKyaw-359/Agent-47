"""
SQLite-backed tools for task and note management.
Tables are auto-created on first import.
"""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data.db"


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(str(DB_PATH))
    c.row_factory = sqlite3.Row
    return c


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _init() -> None:
    c = _conn()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS tasks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            description TEXT DEFAULT '',
            status      TEXT DEFAULT 'pending',
            due_date    TEXT DEFAULT '',
            priority    TEXT DEFAULT 'medium',
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS notes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT NOT NULL,
            content    TEXT DEFAULT '',
            tags       TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)
    c.commit()
    c.close()


_init()


# ---------------------------------------------------------------------------
# Task tools
# ---------------------------------------------------------------------------

def create_task(title: str, description: str = "", due_date: str = "", priority: str = "medium") -> dict:
    """Creates a new task and saves it to the database.

    Args:
        title: Short title for the task.
        description: Optional longer description.
        due_date: Optional due date as a string (e.g. '2026-04-10' or '2026-04-10T14:00:00').
        priority: One of 'low', 'medium', 'high'. Defaults to 'medium'.

    Returns:
        The created task record as a dict with keys: id, title, description,
        status, due_date, priority, created_at, updated_at.
    """
    c = _conn()
    cur = c.execute(
        "INSERT INTO tasks (title, description, due_date, priority) VALUES (?,?,?,?)",
        (title, description, due_date, priority),
    )
    c.commit()
    row = c.execute("SELECT * FROM tasks WHERE id=?", (cur.lastrowid,)).fetchone()
    c.close()
    return dict(row)


def list_tasks(status: str = "") -> list:
    """Lists tasks from the database, optionally filtered by status.

    Args:
        status: Filter by task status. One of 'pending', 'in_progress', 'done'.
                Leave empty to return all tasks.

    Returns:
        List of task dicts ordered by priority (high first) then creation date.
    """
    c = _conn()
    if status:
        rows = c.execute(
            "SELECT * FROM tasks WHERE status=? ORDER BY priority DESC, created_at DESC",
            (status,),
        ).fetchall()
    else:
        rows = c.execute(
            "SELECT * FROM tasks ORDER BY priority DESC, created_at DESC"
        ).fetchall()
    c.close()
    return [dict(r) for r in rows]


def update_task(
    task_id: int,
    title: str = "",
    status: str = "",
    description: str = "",
    due_date: str = "",
    priority: str = "",
) -> dict:
    """Updates one or more fields on an existing task.

    Args:
        task_id: ID of the task to update.
        title: New title (leave blank to keep current).
        status: New status — 'pending', 'in_progress', or 'done'.
        description: New description.
        due_date: New due date string.
        priority: New priority — 'low', 'medium', or 'high'.

    Returns:
        Updated task dict, or {'error': '...'} on failure.
    """
    c = _conn()
    fields, values = [], []
    for col, val in [
        ("title", title),
        ("status", status),
        ("description", description),
        ("due_date", due_date),
        ("priority", priority),
    ]:
        if val:
            fields.append(f"{col}=?")
            values.append(val)
    if not fields:
        c.close()
        return {"error": "No fields to update."}
    fields.append("updated_at=?")
    values.extend([_now(), task_id])
    c.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id=?", values)
    c.commit()
    row = c.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    c.close()
    return dict(row) if row else {"error": f"Task {task_id} not found."}


def delete_task(task_id: int) -> dict:
    """Permanently deletes a task by ID.

    Args:
        task_id: ID of the task to delete.

    Returns:
        {'success': True, 'deleted_task_id': <id>}
    """
    c = _conn()
    c.execute("DELETE FROM tasks WHERE id=?", (task_id,))
    c.commit()
    c.close()
    return {"success": True, "deleted_task_id": task_id}


# ---------------------------------------------------------------------------
# Note tools
# ---------------------------------------------------------------------------

def create_note(title: str, content: str, tags: str = "") -> dict:
    """Creates a new note and saves it to the database.

    Args:
        title: Short title for the note.
        content: Full note content/body.
        tags: Comma-separated tags (e.g., 'work,meeting,q2').

    Returns:
        The created note record as a dict.
    """
    c = _conn()
    cur = c.execute(
        "INSERT INTO notes (title, content, tags) VALUES (?,?,?)",
        (title, content, tags),
    )
    c.commit()
    row = c.execute("SELECT * FROM notes WHERE id=?", (cur.lastrowid,)).fetchone()
    c.close()
    return dict(row)


def search_notes(query: str = "", tag: str = "") -> list:
    """Searches notes by keyword or tag.

    Args:
        query: Search string matched against note title and content.
        tag: Filter notes that contain this tag (partial match).
             Leave both empty to list all notes.

    Returns:
        List of matching note dicts ordered by last updated.
    """
    c = _conn()
    if tag:
        rows = c.execute(
            "SELECT * FROM notes WHERE tags LIKE ? ORDER BY updated_at DESC",
            (f"%{tag}%",),
        ).fetchall()
    elif query:
        rows = c.execute(
            "SELECT * FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC",
            (f"%{query}%", f"%{query}%"),
        ).fetchall()
    else:
        rows = c.execute("SELECT * FROM notes ORDER BY updated_at DESC").fetchall()
    c.close()
    return [dict(r) for r in rows]


def update_note(note_id: int, title: str = "", content: str = "", tags: str = "") -> dict:
    """Updates one or more fields on an existing note.

    Args:
        note_id: ID of the note to update.
        title: New title (leave blank to keep current).
        content: New content.
        tags: New comma-separated tags.

    Returns:
        Updated note dict, or {'error': '...'} on failure.
    """
    c = _conn()
    fields, values = [], []
    for col, val in [("title", title), ("content", content), ("tags", tags)]:
        if val:
            fields.append(f"{col}=?")
            values.append(val)
    if not fields:
        c.close()
        return {"error": "No fields to update."}
    fields.append("updated_at=?")
    values.extend([_now(), note_id])
    c.execute(f"UPDATE notes SET {', '.join(fields)} WHERE id=?", values)
    c.commit()
    row = c.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
    c.close()
    return dict(row) if row else {"error": f"Note {note_id} not found."}


def delete_note(note_id: int) -> dict:
    """Permanently deletes a note by ID.

    Args:
        note_id: ID of the note to delete.

    Returns:
        {'success': True, 'deleted_note_id': <id>}
    """
    c = _conn()
    c.execute("DELETE FROM notes WHERE id=?", (note_id,))
    c.commit()
    c.close()
    return {"success": True, "deleted_note_id": note_id}
