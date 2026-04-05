"""
FastAPI deployment for the Workspace AI multi-agent system (multi-user).

Run with:
    uvicorn testing.api:app --host 0.0.0.0 --port 8000

Or via ADK's built-in server:
    adk api_server testing
"""

import uuid
import json
import re
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


class GmailTriageRequest(BaseModel):
    user_id: str
    query: str = "in:inbox newer_than:7d"
    max_messages: int = 25
    apply_labels: bool = True


class GmailTriageResponse(BaseModel):
    user_id: str
    query: str
    triage: dict
    totals: dict
    notes: str = ""


class GmailSummarizeRequest(BaseModel):
    user_id: str
    query: str = "in:inbox newer_than:14d"
    max_threads: int = 5


class GmailSummarizeResponse(BaseModel):
    user_id: str
    query: str
    summaries: list[dict]
    overall_actions: list[str]


def _extract_first_json(text: str) -> dict:
    """Best-effort JSON extraction from LLM output."""
    try:
        return json.loads(text)
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise ValueError("Model did not return valid JSON")
    return json.loads(match.group(0))


async def _run_user_agent_text(user_id: str, tokens: dict, prompt: str) -> str:
    """Run a one-shot prompt for a user and return final text response."""
    runner = _get_runner(user_id, tokens=tokens)
    session_id = str(uuid.uuid4())

    await session_service.create_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session_id,
    )

    content = Content(role="user", parts=[Part(text=prompt)])
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

    return final_response


def _get_and_refresh_tokens_or_401(user_id: str) -> dict:
    """Load and refresh user tokens or raise HTTP 401."""
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
        refreshed = refresh_tokens_if_needed(user_id)
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail={
                "error": "token_refresh_failed",
                "message": str(exc),
                "hint": f"Re-authenticate via GET /auth/login?user_id={user_id}",
            },
        )

    return refreshed or tokens


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
# Gmail productivity endpoints
# ---------------------------------------------------------------------------

@app.post("/gmail/triage", response_model=GmailTriageResponse)
async def gmail_triage(request: GmailTriageRequest):
    """AI triage: classify inbox emails and optionally apply labels."""
    user_id = request.user_id
    tokens = _get_and_refresh_tokens_or_401(user_id)

    prompt = (
        "You are running an automated Gmail triage workflow.\n"
        "Use Gmail tools to analyze the inbox and return STRICT JSON only.\n\n"
        f"Search query: {request.query}\n"
        f"Max messages to analyze: {request.max_messages}\n"
        f"Apply labels: {request.apply_labels}\n\n"
        "Rules:\n"
        "1) Use gmail.search to fetch candidate messages.\n"
        "2) Use gmail.get for each message you analyze.\n"
        "3) Score urgency based on: deadlines, direct asks, VIP sender, blockers.\n"
        "4) Classify each message into exactly one bucket: urgent, actionable, fyi, can-wait.\n"
        "5) If Apply labels is true, ensure labels exist and apply them to each message.\n"
        "6) Keep each rationale short.\n\n"
        "Output JSON schema:\n"
        "{\n"
        "  \"triage\": {\n"
        "    \"urgent\": [{\"message_id\":\"...\",\"thread_id\":\"...\",\"subject\":\"...\",\"from\":\"...\",\"urgency_score\":90,\"rationale\":\"...\"}],\n"
        "    \"actionable\": [],\n"
        "    \"fyi\": [],\n"
        "    \"can-wait\": []\n"
        "  },\n"
        "  \"totals\": {\"urgent\":0,\"actionable\":0,\"fyi\":0,\"can-wait\":0,\"analyzed\":0},\n"
        "  \"notes\": \"short note\"\n"
        "}"
    )

    raw = await _run_user_agent_text(user_id=user_id, tokens=tokens, prompt=prompt)
    try:
        payload = _extract_first_json(raw)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "invalid_model_output",
                "message": str(exc),
                "raw": raw[:3000],
            },
        )

    triage = payload.get("triage", {})
    totals = payload.get("totals", {})
    notes = payload.get("notes", "")

    return GmailTriageResponse(
        user_id=user_id,
        query=request.query,
        triage=triage,
        totals=totals,
        notes=notes,
    )


@app.post("/gmail/summarize", response_model=GmailSummarizeResponse)
async def gmail_summarize(request: GmailSummarizeRequest):
    """AI summarize: extract facts, decisions, open questions, and actions."""
    user_id = request.user_id
    tokens = _get_and_refresh_tokens_or_401(user_id)

    prompt = (
        "You are running a Gmail thread summarizer workflow.\n"
        "Use Gmail tools and return STRICT JSON only.\n\n"
        f"Search query: {request.query}\n"
        f"Max threads to summarize: {request.max_threads}\n\n"
        "Rules:\n"
        "1) Use gmail.search for candidate messages/threads.\n"
        "2) Use gmail.get to inspect full message contents.\n"
        "3) Group by thread, then summarize the most important threads first.\n"
        "4) For each thread extract: key facts, decisions, open questions, next steps for me, waiting on others.\n"
        "5) Keep bullets short and concrete.\n\n"
        "Output JSON schema:\n"
        "{\n"
        "  \"summaries\": [\n"
        "    {\n"
        "      \"thread_id\": \"...\",\n"
        "      \"subject\": \"...\",\n"
        "      \"participants\": [\"...\"],\n"
        "      \"key_facts\": [\"...\"],\n"
        "      \"decisions\": [\"...\"],\n"
        "      \"open_questions\": [\"...\"],\n"
        "      \"next_steps_for_me\": [\"...\"],\n"
        "      \"waiting_on_others\": [\"...\"]\n"
        "    }\n"
        "  ],\n"
        "  \"overall_actions\": [\"...\"]\n"
        "}"
    )

    raw = await _run_user_agent_text(user_id=user_id, tokens=tokens, prompt=prompt)
    try:
        payload = _extract_first_json(raw)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "invalid_model_output",
                "message": str(exc),
                "raw": raw[:3000],
            },
        )

    return GmailSummarizeResponse(
        user_id=user_id,
        query=request.query,
        summaries=payload.get("summaries", []),
        overall_actions=payload.get("overall_actions", []),
    )


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
