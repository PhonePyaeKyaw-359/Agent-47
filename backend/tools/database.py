"""
SQLAlchemy-backed tools for task and note management.
"""

import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import Column, Integer, String, Text, DateTime, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Database URL from env, default back to local SQLite
DB_PATH = Path(__file__).parent.parent / "data.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

engine = create_engine(
    DATABASE_URL, 
    # Only use connect_args format for SQLite
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def _now() -> datetime:
    return datetime.now(timezone.utc)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    status = Column(String, default="pending")
    due_date = Column(String, default="")
    priority = Column(String, default="medium")
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "due_date": self.due_date,
            "priority": self.priority,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String, nullable=False)
    content = Column(Text, default="")
    tags = Column(String, default="")
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "tags": self.tags,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

# Create all tables on module load (if they don't exist)
Base.metadata.create_all(bind=engine)


# ---------------------------------------------------------------------------
# Task tools
# ---------------------------------------------------------------------------

def create_task(title: str, description: str = "", due_date: str = "", priority: str = "medium") -> dict:
    """Creates a new task and saves it to the database."""
    with SessionLocal() as db:
        new_task = Task(title=title, description=description, due_date=due_date, priority=priority)
        db.add(new_task)
        db.commit()
        db.refresh(new_task)
        return new_task.to_dict()


def list_tasks(status: str = "") -> list:
    """Lists tasks from the database, optionally filtered by status."""
    with SessionLocal() as db:
        query = db.query(Task)
        if status:
            query = query.filter(Task.status == status)
        
        # In Python map priority levels or just sort alphabetically
        # For a truly robust DB order, you'd map priorities to integers.
        # Here we just fetch and let python sort.
        tasks = query.order_by(Task.created_at.desc()).all()
        
        priority_order = {"high": 3, "medium": 2, "low": 1}
        tasks.sort(key=lambda x: priority_order.get(x.priority, 0), reverse=True)
        
        return [t.to_dict() for t in tasks]


def update_task(
    task_id: int,
    title: str = "",
    status: str = "",
    description: str = "",
    due_date: str = "",
    priority: str = "",
) -> dict:
    """Updates one or more fields on an existing task."""
    with SessionLocal() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            return {"error": f"Task {task_id} not found."}

        if title: task.title = title
        if status: task.status = status
        if description: task.description = description
        if due_date: task.due_date = due_date
        if priority: task.priority = priority

        db.commit()
        db.refresh(task)
        return task.to_dict()


def delete_task(task_id: int) -> dict:
    """Permanently deletes a task by ID."""
    with SessionLocal() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if task:
            db.delete(task)
            db.commit()
        return {"success": True, "deleted_task_id": task_id}


# ---------------------------------------------------------------------------
# Note tools
# ---------------------------------------------------------------------------

def create_note(title: str, content: str, tags: str = "") -> dict:
    """Creates a new note and saves it to the database."""
    with SessionLocal() as db:
        new_note = Note(title=title, content=content, tags=tags)
        db.add(new_note)
        db.commit()
        db.refresh(new_note)
        return new_note.to_dict()


def search_notes(query: str = "", tag: str = "") -> list:
    """Searches notes by keyword or tag."""
    with SessionLocal() as db:
        q = db.query(Note)
        if tag:
            q = q.filter(Note.tags.ilike(f"%{tag}%"))
        elif query:
            q = q.filter((Note.title.ilike(f"%{query}%")) | (Note.content.ilike(f"%{query}%")))
        
        notes = q.order_by(Note.updated_at.desc()).all()
        return [n.to_dict() for n in notes]


def update_note(note_id: int, title: str = "", content: str = "", tags: str = "") -> dict:
    """Updates one or more fields on an existing note."""
    with SessionLocal() as db:
        note = db.query(Note).filter(Note.id == note_id).first()
        if not note:
            return {"error": f"Note {note_id} not found."}

        if title: note.title = title
        if content: note.content = content
        if tags: note.tags = tags

        db.commit()
        db.refresh(note)
        return note.to_dict()


def delete_note(note_id: int) -> dict:
    """Permanently deletes a note by ID."""
    with SessionLocal() as db:
        note = db.query(Note).filter(Note.id == note_id).first()
        if note:
            db.delete(note)
            db.commit()
        return {"success": True, "deleted_note_id": note_id}
