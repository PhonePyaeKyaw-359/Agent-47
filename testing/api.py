"""
FastAPI deployment for the Workspace AI multi-agent system.

Run with:
    uvicorn testing.api:app --host 0.0.0.0 --port 8000

Or via ADK's built-in server:
    adk api_server testing
"""

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai.types import Content, Part

from .agent import root_agent

APP_NAME = "workspace_ai"
session_service = InMemorySessionService()
runner: Runner | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global runner
    runner = Runner(
        agent=root_agent,
        app_name=APP_NAME,
        session_service=session_service,
    )
    yield


app = FastAPI(
    title="Workspace AI",
    description=(
        "Multi-agent system for calendar management, task tracking, and notes "
        "powered by Google ADK and Gemini."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class RunRequest(BaseModel):
    message: str
    session_id: str = ""
    user_id: str = "default_user"


class RunResponse(BaseModel):
    response: str
    session_id: str
    user_id: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "agent": root_agent.name, "version": "1.0.0"}


@app.post("/run", response_model=RunResponse)
async def run(request: RunRequest):
    """
    Send a message to the orchestrator agent and receive a response.

    A `session_id` is returned in every response. Pass it back on follow-up
    requests to continue the same conversation.
    """
    if runner is None:
        raise HTTPException(status_code=503, detail="Runner not initialised.")

    session_id = request.session_id or str(uuid.uuid4())

    # Create session if it does not already exist
    existing = await session_service.get_session(
        app_name=APP_NAME, user_id=request.user_id, session_id=session_id
    )
    if existing is None:
        await session_service.create_session(
            app_name=APP_NAME,
            user_id=request.user_id,
            session_id=session_id,
        )

    content = Content(role="user", parts=[Part(text=request.message)])
    final_response = ""

    async for event in runner.run_async(
        user_id=request.user_id,
        session_id=session_id,
        new_message=content,
    ):
        if event.is_final_response() and event.content:
            for part in event.content.parts:
                if hasattr(part, "text") and part.text:
                    final_response += part.text

    return RunResponse(
        response=final_response,
        session_id=session_id,
        user_id=request.user_id,
    )


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user_id: str = "default_user"):
    """Deletes a conversation session."""
    await session_service.delete_session(
        app_name=APP_NAME, user_id=user_id, session_id=session_id
    )
    return {"deleted": session_id}
