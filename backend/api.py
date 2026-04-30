"""
FastAPI deployment for the Agent47 multi-agent system (multi-user).

Run with:
    uvicorn backend.api:app --host 0.0.0.0 --port 8000

Or via ADK's built-in server:
    adk api_server backend
"""

import asyncio
import os
import uuid
import json
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai.errors import ClientError
from google.genai.types import Content, Part
from mcp.shared.exceptions import McpError

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
from .tools.time_tools import set_user_timezone

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=False)
load_dotenv(PROJECT_ROOT / "backend" / ".env", override=False)

APP_NAME = "agent47"
session_service = InMemorySessionService()

# Per-user Runner cache  (user_id → Runner)
_user_runners: dict[str, Runner] = {}


def _validate_llm_environment() -> None:
    """Ensure ADK uses the intended Gemini backend with a clear error."""
    use_vertex = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in {
        "1",
        "true",
        "yes",
    }

    if use_vertex:
        missing = [
            name
            for name in ("GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION")
            if not os.getenv(name)
        ]
        if missing:
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "llm_config_missing",
                    "message": (
                        "Vertex AI mode is enabled, but required environment "
                        f"variables are missing: {', '.join(missing)}. "
                        "Set them in backend/.env and restart the backend."
                    ),
                },
            )
        return

    if not os.getenv("GOOGLE_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail={
                "error": "llm_config_missing",
                "message": (
                    "No Gemini API key was found and Vertex AI mode is not enabled. "
                    "For this project, set GOOGLE_GENAI_USE_VERTEXAI=1, "
                    "GOOGLE_CLOUD_PROJECT, and GOOGLE_CLOUD_LOCATION in backend/.env, "
                    "then restart the backend."
                ),
            },
        )


def _extract_document_id(value: str) -> str:
    """Extract a Google Doc ID from a URL or return the trimmed value."""
    text = (value or "").strip()
    match = re.search(r"/document/d/([a-zA-Z0-9_-]+)", text)
    if match:
        return match.group(1)
    if re.fullmatch(r"[a-zA-Z0-9_-]{20,}", text):
        return text
    return ""


def _is_google_doc_reference(value: str) -> bool:
    text = (value or "").strip()
    return bool(_extract_document_id(text)) and (
        "docs.google.com" in text or re.fullmatch(r"[a-zA-Z0-9_-]{20,}", text)
    )


def _workspace_env(user_id: str, tokens: dict) -> dict:
    """Environment for the Workspace MCP server, including refresh metadata."""
    return {
        **os.environ,
        "WORKSPACE_USER_ID": user_id,
        "WORKSPACE_ACCESS_TOKEN": tokens.get("access_token", ""),
        "WORKSPACE_REFRESH_TOKEN": tokens.get("refresh_token", "") or "",
        "WORKSPACE_TOKEN_EXPIRY": str(tokens.get("expiry_date", 0) or 0),
        "WORKSPACE_TOKEN_SCOPE": tokens.get("scope", ""),
        "WORKSPACE_ENABLE_LOGGING": "true",
    }


async def _call_workspace_tool(
    user_id: str,
    tokens: dict,
    tool_name: str,
    arguments: dict,
) -> str:
    """Call a Workspace MCP tool and raise if the tool returned an error JSON."""
    from mcp.client.session import ClientSession
    from mcp.client.stdio import StdioServerParameters, stdio_client

    workspace_dist = (
        PROJECT_ROOT / "workspace" / "workspace-server" / "dist" / "index.js"
    )
    server_params = StdioServerParameters(
        command="node",
        args=[str(workspace_dist), "--use-dot-names"],
        env=_workspace_env(user_id, tokens),
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, arguments=arguments)

    text = "\n".join(
        item.text for item in result.content if getattr(item, "type", "") == "text"
    )
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and parsed.get("error"):
            raise RuntimeError(parsed["error"])
    except json.JSONDecodeError:
        pass
    return text


def _parse_docs_text(tool_text: str) -> str:
    """Normalize docs.getText output, including multi-tab JSON output."""
    try:
        parsed = json.loads(tool_text)
    except json.JSONDecodeError:
        return tool_text.strip()

    if isinstance(parsed, list):
        return "\n\n".join(
            str(tab.get("content", "")).strip()
            for tab in parsed
            if isinstance(tab, dict) and tab.get("content")
        ).strip()
    if isinstance(parsed, dict):
        return str(parsed.get("content", "") or parsed.get("text", "")).strip()
    return str(parsed).strip()


def _fallback_document_plan(source_text: str, style: str, tone: str) -> dict:
    """Create a usable document plan if the model response is not valid JSON."""
    title = "Formatted Notes"
    style_text = (style or "Report").strip()
    tone_text = (tone or "Professional").strip()
    cleaned = re.sub(r"\s+", " ", source_text).strip()
    return {
        "title": title,
        "sections": [
            {
                "heading": "Overview",
                "paragraphs": [
                    f"These notes have been organized in a {tone_text.lower()} tone as a {style_text.lower()}."
                ],
                "bullets": [cleaned] if cleaned else [],
            }
        ],
    }


async def _build_document_plan(source_text: str, style: str, tone: str) -> dict:
    """Use Gemini to turn messy text into structured JSON for Google Docs."""
    from google import genai

    _validate_llm_environment()
    use_vertex = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in {
        "1",
        "true",
        "yes",
    }
    if use_vertex:
        client = genai.Client(
            vertexai=True,
            project=os.getenv("GOOGLE_CLOUD_PROJECT"),
            location=os.getenv("GOOGLE_CLOUD_LOCATION"),
        )
    else:
        client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

    prompt = f"""
Rewrite the source text into a polished Google Doc plan.

Return ONLY valid JSON with this schema:
{{
  "title": "Concise document title",
  "sections": [
    {{
      "heading": "Section heading",
      "paragraphs": ["Clear paragraph text"],
      "bullets": ["Optional bullet text"]
    }}
  ]
}}

Requirements:
- Style: {style or "Report"}
- Tone: {tone or "Professional"}
- Use a readable business-document structure, not a raw transcript.
- Prefer these sections when the source supports them: Overview, Key Points, Decisions, Action Items, Next Steps.
- Use 3 to 6 useful sections when possible.
- Keep headings short and specific.
- Keep paragraphs short, ideally 1 to 3 sentences each.
- Put scan-friendly information in bullets; each bullet should be concise and meaningful.
- For action items, start bullets with a strong label when known, such as "Owner:", "Due:", or "Next:".
- Do not use Markdown syntax.
- Do not invent facts not present in the source.

Source text:
{source_text}
""".strip()

    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        plan = json.loads(response.text or "{}")
        if not plan.get("title") or not isinstance(plan.get("sections"), list):
            raise ValueError("Missing title or sections")
        return plan
    except Exception:
        return _fallback_document_plan(source_text, style, tone)


def _compose_doc_content_and_formats(plan: dict) -> tuple[str, list[dict]]:
    """Build plain text plus Docs API format ranges."""
    lines: list[str] = []
    formats: list[dict] = []
    current_index = 1

    def add_line(text: str, styles: str | list[str] | None = None) -> None:
        nonlocal current_index
        clean = re.sub(r"\s+", " ", str(text or "")).strip()
        if not clean:
            lines.append("")
            current_index += 1
            return
        start = current_index
        lines.append(clean)
        current_index += len(clean) + 1
        if isinstance(styles, str):
            styles = [styles]
        for style in styles or []:
            formats.append(
                {"startIndex": start, "endIndex": start + len(clean), "style": style}
            )

    def add_paragraph(text: str) -> None:
        clean = re.sub(r"\s+", " ", str(text or "")).strip()
        add_line(clean, "bodySpacing")
        label_match = re.match(r"^([A-Z][A-Za-z0-9 /&()'-]{1,40}:)", clean)
        if label_match:
            start = current_index - len(clean) - 1
            formats.append(
                {
                    "startIndex": start,
                    "endIndex": start + len(label_match.group(1)),
                    "style": "bold",
                }
            )

    add_line(plan.get("title") or "Formatted Notes", ["title", "titleSpacing"])
    add_line("Formatted and structured from your notes", ["subtitle", "subtitleSpacing"])
    add_line("")

    for section in plan.get("sections", []):
        if not isinstance(section, dict):
            continue
        heading = section.get("heading")
        if heading:
            add_line(heading, ["heading2", "sectionSpacing"])
        for paragraph in section.get("paragraphs", []) or []:
            add_paragraph(paragraph)
        for bullet in section.get("bullets", []) or []:
            add_line(bullet, ["bullet", "bulletSpacing"])
        add_line("")

    content = "\n".join(lines).strip() + "\n"
    return content, formats


async def _execute_format_document(user_id: str, tokens: dict, payload: dict) -> dict:
    source_or_link = (payload.get("text_or_doc_link") or "").strip()
    style = (payload.get("style") or "Report").strip()
    tone = (payload.get("tone") or "Professional").strip()
    action = str(payload.get("action") or "").lower()

    if not source_or_link:
        raise HTTPException(
            status_code=400,
            detail="Paste messy text or a Google Doc link before formatting.",
        )

    existing_doc_id = _extract_document_id(source_or_link)
    should_update_existing = "clean" in action or "update" in action

    if existing_doc_id and _is_google_doc_reference(source_or_link):
        original_text = _parse_docs_text(
            await _call_workspace_tool(
                user_id,
                tokens,
                "docs.getText",
                {"documentId": existing_doc_id},
            )
        )
        target_doc_id = existing_doc_id
    else:
        original_text = source_or_link
        target_doc_id = ""
        should_update_existing = False

    plan = await _build_document_plan(original_text, style, tone)
    content, formats = _compose_doc_content_and_formats(plan)
    title = str(plan.get("title") or "Formatted Notes").strip()

    if should_update_existing and target_doc_id:
        await _call_workspace_tool(
            user_id,
            tokens,
            "docs.replaceText",
            {
                "documentId": target_doc_id,
                "findText": original_text,
                "replaceText": content,
            },
        )
        document_id = target_doc_id
    else:
        create_text = await _call_workspace_tool(
            user_id,
            tokens,
            "docs.create",
            {"title": title, "content": content},
        )
        created = json.loads(create_text)
        document_id = created["documentId"]
        title = created.get("title") or title

    if formats:
        await _call_workspace_tool(
            user_id,
            tokens,
            "docs.formatText",
            {"documentId": document_id, "formats": formats},
        )

    return {
        "result": (
            f"Formatted document successfully with {len(formats)} rich-formatting "
            f"change(s): [Open in Google Docs](https://docs.google.com/document/d/{document_id}/edit)"
        ),
        "document_id": document_id,
        "title": title,
        "format_count": len(formats),
    }


async def _execute_doc_summary(user_id: str, tokens: dict, payload: dict) -> dict:
    source_doc = (payload.get("source_doc_link") or "").strip()
    length = (payload.get("length") or "5 bullets").strip()
    focus = (payload.get("focus") or "").strip()
    document_id = _extract_document_id(source_doc)

    if not document_id:
        raise HTTPException(
            status_code=400,
            detail="Select a Google Doc or paste a valid Google Doc link before summarizing.",
        )

    doc_text = _parse_docs_text(
        await _call_workspace_tool(
            user_id,
            tokens,
            "docs.getText",
            {"documentId": document_id},
        )
    )
    if not doc_text:
        raise HTTPException(status_code=400, detail="The selected Google Doc has no readable text.")

    from google import genai

    _validate_llm_environment()
    use_vertex = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in {
        "1",
        "true",
        "yes",
    }
    if use_vertex:
        client = genai.Client(
            vertexai=True,
            project=os.getenv("GOOGLE_CLOUD_PROJECT"),
            location=os.getenv("GOOGLE_CLOUD_LOCATION"),
        )
    else:
        client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

    prompt = f"""
Summarize this Google Doc for the user. Return the summary in chat only.
Do not modify the document. Do not mention inability to edit because editing is not requested.

Requested length: {length}
Focus: {focus or "General summary"}

Document text:
{doc_text}
""".strip()
    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    summary = (response.text or "").strip()
    return {
        "result": summary or "I could read the document, but could not generate a summary.",
        "document_id": document_id,
    }


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
    title="Agent47",
    description=(
        "Multi-agent system for Google Workspace with per-user OAuth. "
            "Supports Google Calendar, Google Chat, Google Docs, "
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
    timezone_offset: str = ""  # e.g. "+07:00" from the browser


class RunResponse(BaseModel):
    response: str
    session_id: str
    user_id: str
    steps: list[str] = []


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


def _string_contains_placeholder(value: object) -> bool:
    """Detect obviously fabricated placeholder/example content."""
    if not isinstance(value, str):
        return False

    normalized = value.strip().lower()
    placeholder_markers = (
        "example.com",
        "simulated",
        "placeholder",
        "mock data",
        "sample data",
        "project alpha",
        "production server down",
        "weekly team update",
        "latest tech trends",
        "pm@example.com",
        "ops@example.com",
        "manager@example.com",
        "designer@example.com",
    )
    if normalized in {"...", "unknown", "n/a", "(no subject)"}:
        return True
    return any(marker in normalized for marker in placeholder_markers)


def _validate_triage_payload(payload: dict) -> None:
    """Reject fabricated or placeholder triage results."""
    triage = payload.get("triage")
    if not isinstance(triage, dict):
        raise ValueError("Triage payload missing triage buckets")

    analyzed_count = 0
    for bucket in ("urgent", "actionable", "fyi", "can-wait"):
        items = triage.get(bucket, [])
        if not isinstance(items, list):
            raise ValueError(f"Triage bucket '{bucket}' is not a list")
        for item in items:
            if not isinstance(item, dict):
                raise ValueError(f"Triage item in '{bucket}' is not an object")
            for required in ("message_id", "thread_id", "subject", "from"):
                value = item.get(required)
                if not value or _string_contains_placeholder(value):
                    raise ValueError(
                        f"Triage returned placeholder or missing field '{required}'"
                    )
            analyzed_count += 1

    notes = payload.get("notes", "")
    if _string_contains_placeholder(notes):
        raise ValueError("Triage notes contain placeholder/example text")

    totals = payload.get("totals", {})
    if isinstance(totals, dict) and "analyzed" in totals:
        try:
            if int(totals["analyzed"]) != analyzed_count:
                raise ValueError("Triage totals do not match analyzed items")
        except (TypeError, ValueError):
            raise ValueError("Triage totals.analyzed is invalid")


def _validate_summarize_payload(payload: dict) -> None:
    """Reject fabricated or placeholder summary results."""
    summaries = payload.get("summaries")
    if not isinstance(summaries, list):
        raise ValueError("Summary payload missing summaries list")

    for summary in summaries:
        if not isinstance(summary, dict):
            raise ValueError("Summary item is not an object")
        for required in ("thread_id", "subject"):
            value = summary.get(required)
            if not value or _string_contains_placeholder(value):
                raise ValueError(
                    f"Summary returned placeholder or missing field '{required}'"
                )

        participants = summary.get("participants", [])
        if not isinstance(participants, list):
            raise ValueError("Summary participants is not a list")
        for participant in participants:
            if _string_contains_placeholder(participant):
                raise ValueError("Summary contains placeholder participant data")

        for field in (
            "key_facts",
            "decisions",
            "open_questions",
            "next_steps_for_me",
            "waiting_on_others",
        ):
            values = summary.get(field, [])
            if not isinstance(values, list):
                raise ValueError(f"Summary field '{field}' is not a list")
            for value in values:
                if _string_contains_placeholder(value):
                    raise ValueError(
                        f"Summary field '{field}' contains placeholder/example text"
                    )

    overall_actions = payload.get("overall_actions", [])
    if not isinstance(overall_actions, list):
        raise ValueError("Summary overall_actions is not a list")
    for value in overall_actions:
        if _string_contains_placeholder(value):
            raise ValueError("Summary overall_actions contains placeholder text")


async def _run_user_agent_text(user_id: str, tokens: dict, prompt: str) -> str:
    """Run a one-shot prompt for a user and return final text response."""
    _validate_llm_environment()
    runner = _get_runner(user_id, tokens=tokens)
    session_id = str(uuid.uuid4())

    await session_service.create_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session_id,
    )

    content = Content(role="user", parts=[Part(text=prompt)])
    final_response = ""

    try:
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=content,
        ):
            if event.is_final_response() and event.content:
                for part in event.content.parts:
                    if hasattr(part, "text") and part.text:
                        final_response += part.text
    except ClientError as exc:
        code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        if code == 429:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "rate_limited",
                    "message": "Vertex AI quota exhausted. Please wait a moment and try again.",
                },
            )
        if code == 404:
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "model_unavailable",
                    "message": "Configured model is unavailable for this project/region. Please update model configuration.",
                },
            )
        raise

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
    callback_url = "http://localhost:8000/auth/callback"
    url = generate_login_url(user_id=user_id, callback_url=callback_url)
    return {"user_id": user_id, "auth_url": url}


@app.get("/auth/callback", response_class=HTMLResponse)
async def auth_callback(
    code: str = Query(""),
    state: str = Query(""),
    error: str = Query(""),
):
    if error:
        raise HTTPException(status_code=400, detail=f"Auth error: {error}")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    try:
        user_id = process_oauth_callback(code=code, state_csrf=state)
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


# ---------------------------------------------------------------------------
# Speech-to-Text — WebSocket (batch recognize, reliable webm/opus support)
# ---------------------------------------------------------------------------

@app.websocket("/ws/speech")
async def speech_websocket(websocket: WebSocket, language: str = "en-US"):
    """Transcribe mic audio via Google Cloud Speech-to-Text.

    Protocol:
      · Client → Server: binary audio frames (webm/opus chunks from MediaRecorder)
      · Client → Server: text ``"DONE"`` to signal end of recording
      · Server → Client: ``{"type":"final","transcript":"..."}``
      · Server → Client: ``{"type":"done"}``
      · Server → Client: ``{"type":"error","message":"..."}``
    """
    await websocket.accept()

    audio_chunks: list[bytes] = []

    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                return
            if "bytes" in message and message["bytes"]:
                audio_chunks.append(message["bytes"])
            elif message.get("text") == "DONE":
                break
    except WebSocketDisconnect:
        return
    except Exception:
        return

    if not audio_chunks:
        await websocket.send_json({"type": "done"})
        return

    try:
        from google.cloud import speech as gcp_speech

        audio_bytes = b"".join(audio_chunks)

        def _transcribe() -> str:
            client = gcp_speech.SpeechClient()
            config = gcp_speech.RecognitionConfig(
                encoding=gcp_speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
                sample_rate_hertz=48000,
                language_code=language,
                enable_automatic_punctuation=True,
            )
            response = client.recognize(
                config=config,
                audio=gcp_speech.RecognitionAudio(content=audio_bytes),
            )
            return " ".join(
                r.alternatives[0].transcript
                for r in response.results
                if r.alternatives
            ).strip()

        loop = asyncio.get_running_loop()
        transcript = await loop.run_in_executor(None, _transcribe)

        if transcript:
            await websocket.send_json({"type": "final", "transcript": transcript})
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})

    try:
        await websocket.send_json({"type": "done"})
    except Exception:
        pass


@app.post("/run", response_model=RunResponse)
async def run(request: RunRequest):
    """Send a message to the orchestrator and receive a response.

    The user must be authenticated first via ``/auth/login``.
    A ``session_id`` is returned in every response — pass it back on
    follow-up requests to continue the same conversation.
    """
    user_id = request.user_id

    # Apply the user's timezone so get_current_time() returns the correct local time
    if request.timezone_offset:
        set_user_timezone(request.timezone_offset)

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
    _validate_llm_environment()
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

    message_text = request.message
    content = Content(role="user", parts=[Part(text=message_text)])
    final_response = ""
    steps = []

    try:
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=content,
        ):
            if hasattr(event, "get_function_calls") and event.get_function_calls():
                for fc in event.get_function_calls():
                    steps.append(f"{event.author} → {fc.name}()")
            
            if event.is_final_response() and event.content:
                for part in event.content.parts:
                    if hasattr(part, "text") and part.text:
                        final_response += part.text
    except ClientError as exc:
        import traceback, sys
        print(f"[agent47] ClientError: {exc}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        if code == 429:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "rate_limited",
                    "message": "Vertex AI quota exhausted. Please wait a moment and try again.",
                },
            )
        if code == 404:
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "model_unavailable",
                    "message": f"Model unavailable: {exc}",
                },
            )
        raise
    except McpError as exc:
        import traceback, sys

        print(f"[agent47] McpError: {exc}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)

        # Reset cached runtime state so the next request gets a fresh MCP process.
        _invalidate_runner(user_id)
        invalidate_user_agent(user_id)
        invalidate_user_toolset(user_id)

        message = str(exc)
        status = 504 if "Timed out while waiting for response" in message else 503
        raise HTTPException(
            status_code=status,
            detail={
                "error": "mcp_timeout" if status == 504 else "mcp_error",
                "message": message,
            },
        )
    except (ValueError, RuntimeError) as exc:
        import traceback, sys
        print(f"[agent47] {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        raise HTTPException(
            status_code=503,
            detail={
                "error": "agent_init_error",
                "message": str(exc),
            },
        )

    return RunResponse(
        response=final_response,
        session_id=session_id,
        user_id=user_id,
        steps=steps,
    )


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user_id: str = "default_user"):
    """Deletes a conversation session."""
    await session_service.delete_session(
        app_name=APP_NAME, user_id=user_id, session_id=session_id
    )
    return {"deleted": session_id}

class ExecuteActionRequest(BaseModel):
    intent: str
    payload: dict
    session_id: str = ""
    user_id: str = "default_user"


@app.get("/api/google-docs")
async def list_google_docs(
    user_id: str = "default_user",
    query: str = "",
    page_size: int = 20,
):
    """List Google Docs the user can access for picker UI fields."""
    tokens = get_user_tokens(user_id)
    if tokens is None:
        raise HTTPException(status_code=401, detail="Unauthenticated")

    try:
        tokens = refresh_tokens_if_needed(user_id) or tokens
    except Exception as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    safe_query = query.replace("\\", "\\\\").replace("'", "\\'")
    drive_query = "mimeType='application/vnd.google-apps.document' and trashed=false"
    if safe_query.strip():
        drive_query += f" and name contains '{safe_query.strip()}'"

    try:
        result_text = await _call_workspace_tool(
            user_id,
            tokens,
            "drive.search",
            {
                "query": drive_query,
                "pageSize": max(1, min(page_size, 50)),
            },
        )
        parsed = json.loads(result_text)
        files = parsed.get("files", parsed) if isinstance(parsed, dict) else parsed
        docs = []
        for file in files or []:
            if not isinstance(file, dict):
                continue
            file_id = file.get("id")
            if not file_id:
                continue
            docs.append(
                {
                    "id": file_id,
                    "name": file.get("name") or "Untitled document",
                    "modifiedTime": file.get("modifiedTime"),
                    "url": f"https://docs.google.com/document/d/{file_id}/edit",
                }
            )
        return {"docs": docs}
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list Google Docs: {str(exc)}",
        )


@app.post("/api/execute-action")
async def execute_action(request: ExecuteActionRequest):
    """
    Deterministic Execution Endpoint.
    Receives user-confirmed intent and payload, bypassing the conversational LLM 
    for pure API calls where applicable.
    """
    user_id = request.user_id
    tokens = get_user_tokens(user_id)
    if tokens is None:
        raise HTTPException(status_code=401, detail="Unauthenticated")
        
    try:
        tokens = refresh_tokens_if_needed(user_id) or tokens
    except Exception as exc:
        raise HTTPException(status_code=401, detail=str(exc))
        
    intent = request.intent
    payload = request.payload
    
    # 1. Pure API Call Path (No AI)
    if intent == "send_email":
        from mcp.client.stdio import stdio_client, StdioServerParameters
        from mcp.client.session import ClientSession
        
        _WORKSPACE_DIST = Path(__file__).resolve().parent.parent / "workspace" / "workspace-server" / "dist" / "index.js"
        env = _workspace_env(user_id, tokens)
        
        server_params = StdioServerParameters(command="node", args=[str(_WORKSPACE_DIST), "--use-dot-names"], env=env)
        try:
            async with stdio_client(server_params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    # Directly invoke the gmail.send MCP tool
                    mcp_args = {
                        "to": payload.get("to", ""),
                        "subject": payload.get("subject", ""),
                        "body": payload.get("body", ""),
                        "isHtml": True
                    }
                    if "cc" in payload and payload["cc"]:
                        mcp_args["cc"] = payload["cc"]
                    
                    result = await session.call_tool("gmail.send", arguments=mcp_args)
                    text_content = next((item.text for item in result.content if item.type == 'text'), str(result.content))
                    return {"result": f"Email sent successfully!"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"API Execution failed: {str(e)}")

    if intent == "do_format":
        try:
            return await _execute_format_document(user_id, tokens, payload)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Document formatting failed: {str(exc)}",
            )

    if intent == "execute_summary":
        try:
            return await _execute_doc_summary(user_id, tokens, payload)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Document summary failed: {str(exc)}",
            )
            
    # 2. Constrained AI Path (For generation/analysis intents)
    else:
        # For intents that intrinsically require AI (like summarizing, formatting, analyzing data),
        # we route them through the Orchestrator but strictly command it to execute.
        _validate_llm_environment()
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
        
        payload_json = json.dumps({'intent': intent, 'payload': payload}, indent=2)
        system_command = f"[SYSTEM: EXECUTE_INTENT]\n{payload_json}"
        content = Content(role="user", parts=[Part(text=system_command)])
        
        final_response = ""
        try:
            async for event in runner.run_async(user_id=user_id, session_id=session_id, new_message=content):
                if event.is_final_response() and event.content:
                    for part in event.content.parts:
                        if hasattr(part, "text") and part.text:
                            final_response += part.text
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
            
        return {"result": final_response}
