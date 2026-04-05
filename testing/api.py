"""
FastAPI deployment for the Workspace AI multi-agent system (multi-user).

Run with:
    uvicorn testing.api:app --host 0.0.0.0 --port 8000

Or via ADK's built-in server:
    adk api_server testing
"""

import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai.types import Content, Part

from .agent import get_root_agent, invalidate_user_agent
from .agents.workspace_mcp import invalidate_user_toolset
from .tools.user_auth import (
    generate_login_url,
    get_user_tokens,
    list_authenticated_users,
    process_oauth_callback,
    refresh_tokens_if_needed,
    delete_user_tokens,
)

APP_NAME = "workspace_ai"
session_service = InMemorySessionService()

# Per-user Runner cache  (user_id → Runner)
_user_runners: dict[str, Runner] = {}


def _get_runner(user_id: str, tokens: Optional[dict] = None) -> Runner:
    """Return (or create) a Runner bound to the per-user agent tree."""
    if user_id not in _user_runners:
        agent = get_root_agent(user_id=user_id, tokens=tokens)
        _user_runners[user_id] = Runner(
            agent=agent,
            app_name=APP_NAME,
            session_service=session_service,
        )
    return _user_runners[user_id]


def _invalidate_runner(user_id: str) -> None:
    _user_runners.pop(user_id, None)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Workspace AI",
    description=(
        "Multi-agent system for Google Workspace with per-user OAuth. "
        "Supports Google Calendar, Gmail, Google Chat, Google Docs, "
        "Google Sheets, Google Slides, task tracking, and notes."
    ),
    version="2.0.0",
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
# Auth endpoints
# ---------------------------------------------------------------------------

@app.get("/auth/login")
async def auth_login(
    request: Request,
    user_id: str = Query(..., description="Unique identifier for the user"),
):
    """Return an OAuth consent URL for the given user_id.

    The user should open this URL in their browser. After granting
    permissions, Google redirects through the Cloud Function back to
    ``/auth/callback`` on this server.
    """
    # Build callback URL — force https when behind Cloud Run's load balancer
    # (Cloud Run terminates TLS and forwards via HTTP internally, so
    # request.base_url would return http:// without this correction)
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    base = str(request.base_url).rstrip("/")
    if base.startswith("http://") and proto == "https":
        base = "https://" + base[len("http://"):]
    callback_url = base + "/auth/callback"
    url = generate_login_url(user_id=user_id, callback_url=callback_url)
    return {"user_id": user_id, "auth_url": url}


@app.get("/auth/callback", response_class=HTMLResponse)
async def auth_callback(
    access_token: str = Query(""),
    refresh_token: str = Query(""),
    scope: str = Query(""),
    token_type: str = Query("Bearer"),
    expiry_date: str = Query("0"),
    state: str = Query(""),
):
    """OAuth callback — receives tokens from the Cloud Function redirect.

    The Cloud Function decodes the ``state`` (which contains our callback
    URI), exchanges the auth code for tokens, and redirects here with the
    tokens as query parameters.
    """
    if not access_token:
        raise HTTPException(status_code=400, detail="Missing access_token")

    try:
        user_id = process_oauth_callback(
            access_token=access_token,
            refresh_token=refresh_token,
            scope=scope,
            token_type=token_type,
            expiry_date=expiry_date,
            state_csrf=state,
        )
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    # Invalidate any cached agent/runner so they are re-created with tokens
    _invalidate_runner(user_id)
    invalidate_user_agent(user_id)
    invalidate_user_toolset(user_id)

    return HTMLResponse(
        f"<h2>✅ Authentication successful for <code>{user_id}</code></h2>"
        "<p>You can close this tab and return to the CLI / app.</p>"
    )


@app.get("/auth/status/{user_id}")
async def auth_status(user_id: str):
    """Check whether a user has stored OAuth tokens (and if they are fresh)."""
    tokens = get_user_tokens(user_id)
    if tokens is None:
        return {"user_id": user_id, "authenticated": False}

    # Attempt proactive refresh
    try:
        tokens = refresh_tokens_if_needed(user_id)
    except Exception:
        pass  # still return the stored status even if refresh fails

    return {
        "user_id": user_id,
        "authenticated": True,
        "scope": tokens.get("scope", "") if tokens else "",
        "expiry_date": tokens.get("expiry_date", 0) if tokens else 0,
    }


@app.get("/auth/users")
async def auth_users():
    """List all user_ids that have stored tokens."""
    return {"users": list_authenticated_users()}


@app.delete("/auth/logout/{user_id}")
async def auth_logout(user_id: str):
    """Remove stored tokens and cached agent/runner for a user."""
    delete_user_tokens(user_id)
    _invalidate_runner(user_id)
    invalidate_user_agent(user_id)
    invalidate_user_toolset(user_id)
    return {"user_id": user_id, "logged_out": True}


# ---------------------------------------------------------------------------
# Core endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "version": "2.0.0"}


@app.post("/run", response_model=RunResponse)
async def run(request: RunRequest):
    """Send a message to the orchestrator and receive a response.

    The user must be authenticated first via ``/auth/login``.
    A ``session_id`` is returned in every response — pass it back on
    follow-up requests to continue the same conversation.
    """
    user_id = request.user_id

    # ── 1. Check / refresh tokens ───────────────────────────────────
    tokens = get_user_tokens(user_id)
    if tokens is None:
        raise HTTPException(
            status_code=401,
            detail={
                "error": "unauthenticated",
                "message": f"User '{user_id}' has not authenticated yet.",
                "hint": f"GET /auth/login?user_id={user_id}",
            },
        )

    try:
        tokens = refresh_tokens_if_needed(user_id)
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail={
                "error": "token_refresh_failed",
                "message": str(exc),
                "hint": f"Re-authenticate via GET /auth/login?user_id={user_id}",
            },
        )

    # ── 2. Get per-user runner ──────────────────────────────────────
    runner = _get_runner(user_id, tokens=tokens)

    session_id = request.session_id or str(uuid.uuid4())

    existing = await session_service.get_session(
        app_name=APP_NAME, user_id=user_id, session_id=session_id
    )
    if existing is None:
        await session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
        )

    content = Content(role="user", parts=[Part(text=request.message)])
    final_response = ""

    async for event in runner.run_async(
        user_id=user_id,
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
        user_id=user_id,
    )


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user_id: str = "default_user"):
    """Deletes a conversation session."""
    await session_service.delete_session(
        app_name=APP_NAME, user_id=user_id, session_id=session_id
    )
    return {"deleted": session_id}
