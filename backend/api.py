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
from datetime import datetime
from html import escape
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


def _get_genai_client():
    """Create a Gemini client in either Vertex AI or API-key mode."""
    from google import genai

    _validate_llm_environment()
    use_vertex = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in {
        "1",
        "true",
        "yes",
    }
    if use_vertex:
        return genai.Client(
            vertexai=True,
            project=os.getenv("GOOGLE_CLOUD_PROJECT"),
            location=os.getenv("GOOGLE_CLOUD_LOCATION"),
        )
    return genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))


def _extract_document_id(value: str) -> str:
    """Extract a Google Doc ID from a URL or return the trimmed value."""
    text = (value or "").strip()
    match = re.search(r"/document/d/([a-zA-Z0-9_-]+)", text)
    if match:
        return match.group(1)
    if re.fullmatch(r"[a-zA-Z0-9_-]{20,}", text):
        return text
    return ""


def _extract_presentation_id(value: str) -> str:
    """Extract a Google Slides presentation ID from a URL or return the trimmed value."""
    text = (value or "").strip()
    match = re.search(r"/presentation/d/([a-zA-Z0-9_-]+)", text)
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
            details = parsed.get("details") or parsed.get("help")
            message = parsed["error"]
            if details:
                message = f"{message}: {details}"
            raise RuntimeError(message)
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


def _email_plain_text_to_html(body: str) -> str:
    """Convert editable plain text into readable Gmail HTML."""
    text = (body or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return ""

    blocks = re.split(r"\n\s*\n", text)
    html_blocks: list[str] = []

    for block in blocks:
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue

        if all(re.match(r"^[-*•]\s+", line) for line in lines):
            items = [
                f"<li>{escape(re.sub(r'^[-*•]\\s+', '', line))}</li>"
                for line in lines
            ]
            html_blocks.append(
                "<ul style=\"margin:0 0 14px 22px;padding:0;line-height:1.55;\">"
                + "".join(items)
                + "</ul>"
            )
            continue

        paragraph = "<br>".join(escape(line) for line in lines)
        html_blocks.append(
            f"<p style=\"margin:0 0 14px 0;line-height:1.55;\">{paragraph}</p>"
        )

    return (
        "<div style=\"font-family:Arial,sans-serif;font-size:14px;"
        "line-height:1.55;color:#202124;\">"
        + "".join(html_blocks)
        + "</div>"
    )


def _extract_urls(value: str) -> list[str]:
    """Extract URLs from a user-provided attachment/link field."""
    urls = re.findall(r"https?://[^\s,<>]+", value or "")
    cleaned = []
    for url in urls:
        cleaned.append(url.rstrip(").,;"))
    return cleaned


def _attachment_kind_from_url(url: str) -> str:
    if "/document/d/" in url:
        return "Google Doc"
    if "/presentation/d/" in url:
        return "Google Slides"
    if "/spreadsheets/d/" in url:
        return "Google Sheet"
    if "drive.google.com" in url or "docs.google.com" in url:
        return "Google Drive file"
    return "Link"


def _workspace_url_from_file(file_id: str, mime_type: str, fallback_url: str) -> str:
    """Return the best editor URL for a Google Workspace file."""
    if mime_type == "application/vnd.google-apps.document":
        return f"https://docs.google.com/document/d/{file_id}/edit"
    if mime_type == "application/vnd.google-apps.presentation":
        return f"https://docs.google.com/presentation/d/{file_id}/edit"
    if mime_type == "application/vnd.google-apps.spreadsheet":
        return f"https://docs.google.com/spreadsheets/d/{file_id}/edit"
    return fallback_url


async def _resolve_workspace_urls_from_text(
    user_id: str,
    tokens: dict,
    text: str,
) -> list[dict]:
    """Extract Google URLs from prose and resolve generic Drive links when possible."""
    urls = [
        url for url in _extract_urls(text)
        if "docs.google.com" in url or "drive.google.com" in url
    ]
    resolved: list[dict] = []

    for url in urls:
        mime_type = ""
        resolved_url = url
        try:
            result_text = await _call_workspace_tool(
                user_id,
                tokens,
                "drive.search",
                {"query": url, "pageSize": 1},
            )
            parsed = json.loads(result_text)
            files = parsed.get("files", parsed) if isinstance(parsed, dict) else parsed
            if isinstance(files, list) and files:
                file = files[0]
                file_id = file.get("id") or ""
                mime_type = file.get("mimeType") or ""
                if file_id:
                    resolved_url = _workspace_url_from_file(file_id, mime_type, url)
        except Exception:
            pass

        if not mime_type:
            if "/document/d/" in url:
                mime_type = "application/vnd.google-apps.document"
            elif "/presentation/d/" in url:
                mime_type = "application/vnd.google-apps.presentation"
            elif "/spreadsheets/d/" in url:
                mime_type = "application/vnd.google-apps.spreadsheet"

        resolved.append({"url": resolved_url, "original_url": url, "mimeType": mime_type})

    return resolved


def _looks_like_file_reference(value: str) -> bool:
    """Heuristic for deciding if a parsed phrase is likely a Drive file name."""
    text = re.sub(r"\s+", " ", value or "").strip()
    if not text or "\n" in value or len(text) > 120:
        return False
    if " " not in text and "." not in text:
        return False
    return True


async def _find_workspace_file_url_by_name(
    user_id: str,
    tokens: dict,
    name_or_hint: str,
    mime_type: str = "",
) -> str:
    """Search Drive for a named file and return the best URL match."""
    query_text = re.sub(r"https?://\S+", " ", name_or_hint or "")
    query_text = re.sub(r"\b(google|doc|docs|document|sheet|spreadsheet|slides|slide|deck|file|named|called)\b", " ", query_text, flags=re.I)
    query_text = re.sub(r"\s+", " ", query_text).strip(" '\".,;:")
    if not _looks_like_file_reference(query_text):
        return ""

    safe_query = query_text.replace("\\", "\\\\").replace("'", "\\'")
    if mime_type:
        drive_query = f"mimeType='{mime_type}' and trashed=false and name contains '{safe_query}'"
    else:
        drive_query = (
            "("
            "mimeType='application/vnd.google-apps.document' or "
            "mimeType='application/vnd.google-apps.presentation' or "
            "mimeType='application/vnd.google-apps.spreadsheet'"
            f") and trashed=false and name contains '{safe_query}'"
        )

    try:
        result_text = await _call_workspace_tool(
            user_id,
            tokens,
            "drive.search",
            {"query": drive_query, "pageSize": 1},
        )
        parsed = json.loads(result_text)
        files = parsed.get("files", parsed) if isinstance(parsed, dict) else parsed
        if isinstance(files, list) and files:
            file = files[0]
            file_id = file.get("id") or ""
            found_mime_type = file.get("mimeType") or mime_type
            if file_id:
                return _workspace_url_from_file(
                    file_id,
                    found_mime_type,
                    f"https://drive.google.com/file/d/{file_id}/view",
                )
    except Exception:
        return ""

    return ""


async def _resolve_attachment_links(
    user_id: str,
    tokens: dict,
    attachment_value: str,
) -> list[dict]:
    """Build display metadata for attachment links without blocking send on lookup."""
    urls = _extract_urls(attachment_value)
    if not urls:
        return []

    attachments = []
    for url in urls:
        title = _attachment_kind_from_url(url)
        try:
            result_text = await _call_workspace_tool(
                user_id,
                tokens,
                "drive.search",
                {"query": url, "pageSize": 1},
            )
            parsed = json.loads(result_text)
            files = parsed.get("files", parsed) if isinstance(parsed, dict) else parsed
            if isinstance(files, list) and files:
                name = files[0].get("name")
                if name:
                    title = name
        except Exception:
            pass

        attachments.append({"title": title, "url": url})
    return attachments


def _append_attachment_links_to_html(html_body: str, attachments: list[dict]) -> str:
    """Append Google Workspace links to the outgoing HTML email."""
    if not attachments:
        return html_body

    items = []
    for attachment in attachments:
        title = escape(str(attachment.get("title") or "Attachment"))
        url = escape(str(attachment.get("url") or ""))
        if not url:
            continue
        items.append(
            f'<li style="margin:0 0 6px 0;"><a href="{url}" '
            f'style="color:#0b57d0;text-decoration:underline;">{title}</a></li>'
        )

    if not items:
        return html_body

    section = (
        '<div style="margin-top:18px;padding-top:12px;'
        'border-top:1px solid #dadce0;">'
        '<p style="margin:0 0 8px 0;font-weight:600;line-height:1.55;">'
        "Attachments</p>"
        '<ul style="margin:0 0 0 22px;padding:0;line-height:1.55;">'
        + "".join(items)
        + "</ul></div>"
    )

    if html_body.endswith("</div>"):
        return html_body[:-6] + section + "</div>"
    return html_body + section


def _normalize_local_attachments(payload: dict) -> list[dict]:
    """Validate local upload payloads for Gmail MIME attachments."""
    raw_files = payload.get("local_attachments") or []
    if not isinstance(raw_files, list):
        return []

    attachments = []
    total_bytes = 0
    for raw in raw_files:
        if not isinstance(raw, dict):
            continue
        filename = str(raw.get("filename") or "").strip()
        content = str(raw.get("content") or "").strip()
        if not filename or not content:
            continue
        if "," in content and content.startswith("data:"):
            content = content.split(",", 1)[1]

        try:
            size = int(raw.get("size") or 0)
        except (TypeError, ValueError):
            size = 0
        total_bytes += size
        attachments.append(
            {
                "filename": filename,
                "content": content,
                "contentType": str(raw.get("contentType") or "application/octet-stream"),
            }
        )

    if total_bytes > 20 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Local email attachments must be under 20 MB total.",
        )
    return attachments


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
    line_formats: list[dict] = []

    def docs_index_len(text: str) -> int:
        return len(text.encode("utf-16-le")) // 2

    def add_line(text: str, styles: str | list[str] | None = None) -> None:
        clean = re.sub(r"\s+", " ", str(text or "")).strip()
        if not clean:
            lines.append("")
            return
        if isinstance(styles, str):
            styles = [styles]
        lines.append(clean)
        line_formats.append(
            {
                "line_index": len(lines) - 1,
                "start_offset": 0,
                "end_offset": docs_index_len(clean),
                "styles": styles or [],
            }
        )

    def add_paragraph(text: str) -> None:
        clean = re.sub(r"\s+", " ", str(text or "")).strip()
        add_line(clean, "bodySpacing")
        label_match = re.match(r"^([A-Z][A-Za-z0-9 /&()'-]{1,40}:)", clean)
        if label_match:
            line_formats.append(
                {
                    "line_index": len(lines) - 1,
                    "start_offset": 0,
                    "end_offset": docs_index_len(label_match.group(1)),
                    "styles": ["bold"],
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

    while lines and lines[-1] == "":
        lines.pop()

    content = "\n".join(lines).strip() + "\n"
    line_starts: list[int] = []
    cursor = 1
    for line in lines:
        line_starts.append(cursor)
        cursor += docs_index_len(line) + 1

    max_index = docs_index_len(content) + 1
    formats: list[dict] = []
    for item in line_formats:
        line_index = item["line_index"]
        if line_index >= len(line_starts):
            continue
        start = line_starts[line_index] + item["start_offset"]
        end = line_starts[line_index] + item["end_offset"]
        if start >= max_index or end > max_index or start >= end:
            continue
        for style in item["styles"]:
            formats.append({"startIndex": start, "endIndex": end, "style": style})

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


async def _execute_slides_summary(user_id: str, tokens: dict, payload: dict) -> dict:
    presentation_link = (
        payload.get("presentation_link")
        or payload.get("presentation_id")
        or payload.get("slides_link")
        or ""
    ).strip()
    length = (payload.get("length") or "Executive summary").strip()
    focus = (payload.get("focus") or "").strip()
    presentation_id = _extract_presentation_id(presentation_link)

    if not presentation_id:
        raise HTTPException(
            status_code=400,
            detail="Select a Google Slides deck or paste a valid Google Slides link before summarizing.",
        )

    metadata_text = await _call_workspace_tool(
        user_id,
        tokens,
        "slides.getMetadata",
        {"presentationId": presentation_id},
    )
    slide_text = (
        await _call_workspace_tool(
            user_id,
            tokens,
            "slides.getText",
            {"presentationId": presentation_id},
        )
    ).strip()

    if not slide_text:
        raise HTTPException(status_code=400, detail="The selected Slides deck has no readable text.")

    client = _get_genai_client()
    prompt = f"""
Summarize this Google Slides deck for the user. Return the answer in Markdown.
Do not modify the presentation.

Requested summary style: {length}
Focus: {focus or "General deck summary"}

Structure:
- Start with a short deck overview.
- Include the 3 to 5 most important takeaways.
- Include a slide-by-slide summary when useful.
- Call out missing context, sparse slides, or image-heavy slides if the extracted text suggests it.
- Do not invent facts that are not present in the slide text.

Presentation metadata:
{metadata_text}

Extracted slide text:
{slide_text}
""".strip()
    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    summary = (response.text or "").strip()
    url = f"https://docs.google.com/presentation/d/{presentation_id}/edit"
    return {
        "result": summary or "I could read the Slides deck, but could not generate a summary.",
        "presentation_id": presentation_id,
        "url": url,
    }


async def _execute_generate_document(user_id: str, tokens: dict, payload: dict) -> dict:
    title = (payload.get("title") or "Untitled Document").strip()
    content_type = (payload.get("content_type") or "Document").strip()
    outline = (payload.get("outline") or "").strip()
    depth = (payload.get("content_depth") or "Detailed").strip()
    tone = (payload.get("tone") or "Professional").strip()

    if not title:
        raise HTTPException(status_code=400, detail="Provide a document title before creating it.")

    plan_source = (
        f"Create a {depth.lower()} {content_type.lower()} titled {title}. "
        f"Tone: {tone}. User outline/request: {outline or 'Create a useful structured document.'}"
    )
    plan = await _build_document_plan(plan_source, content_type, tone)
    plan["title"] = title
    content, formats = _compose_doc_content_and_formats(plan)

    create_text = await _call_workspace_tool(
        user_id,
        tokens,
        "docs.create",
        {"title": title, "content": content},
    )
    created = json.loads(create_text)
    document_id = created["documentId"]

    if formats:
        await _call_workspace_tool(
            user_id,
            tokens,
            "docs.formatText",
            {"documentId": document_id, "formats": formats},
        )

    url = f"https://docs.google.com/document/d/{document_id}/edit"
    return {
        "result": f'Created "{title}": [Open in Google Docs]({url})',
        "document_id": document_id,
        "title": title,
        "url": url,
        "format_count": len(formats),
    }


async def _execute_schedule_event(user_id: str, tokens: dict, payload: dict) -> dict:
    title = (payload.get("title") or "").strip()
    date_text = (payload.get("date") or "").strip()
    start_time = (payload.get("start_time") or "").strip()
    duration = (payload.get("duration") or "1 hour").strip()
    description = (payload.get("description") or "").strip()
    attendees = (payload.get("attendees") or "").strip()
    attachments = payload.get("attachments") or []
    add_meet = str(payload.get("add_google_meet") or "").strip().lower() in {
        "yes",
        "true",
        "1",
        "add",
    }

    # Append Google Drive attachment links into the description
    if attachments and isinstance(attachments, list):
        attachment_lines = []
        for att in attachments:
            if not isinstance(att, dict):
                continue
            name = att.get("name", "Untitled")
            url = att.get("url", "")
            if not url:
                file_id = att.get("id", "")
                if file_id:
                    url = f"https://drive.google.com/file/d/{file_id}/view"
            if url:
                attachment_lines.append(f"📎 {name}: {url}")
        if attachment_lines:
            separator = "\n\n---\n📂 Attachments:\n" if description else "📂 Attachments:\n"
            description = description + separator + "\n".join(attachment_lines)

    if not title or not date_text or not start_time:
        raise HTTPException(
            status_code=400,
            detail="Title, date, and start time are required to schedule an event.",
        )

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

    timezone_offset = os.getenv("USER_TIMEZONE_OFFSET", "+07:00")
    prompt = f"""
Convert this event request into strict JSON for Google Calendar.
Current local date: {datetime.now().date().isoformat()}
Timezone offset: {timezone_offset}

Return ONLY JSON:
{{
  "start": "YYYY-MM-DDTHH:MM:SS+07:00",
  "end": "YYYY-MM-DDTHH:MM:SS+07:00"
}}

Event date: {date_text}
Start time: {start_time}
Duration: {duration}
""".strip()
    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    parsed = json.loads(response.text or "{}")
    start_iso = parsed.get("start")
    end_iso = parsed.get("end")
    if not start_iso or not end_iso:
        raise RuntimeError("Could not parse event date/time.")

    def normalize_datetime(value: str) -> str:
        value = str(value).strip()
        if re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$", value):
            return re.sub(r"(\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})$", r"\1:00\2", value)
        if re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$", value):
            return f"{value}:00{timezone_offset}"
        if re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$", value):
            return f"{value}{timezone_offset}"
        return value

    start_iso = normalize_datetime(start_iso)
    end_iso = normalize_datetime(end_iso)

    attendee_emails = re.findall(
        r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
        attendees,
    )

    event_args = {
        "calendarId": "primary",
        "summary": title,
        "description": description,
        "start": {"dateTime": start_iso},
        "end": {"dateTime": end_iso},
        "addGoogleMeet": add_meet,
    }
    if attendee_emails:
        event_args["attendees"] = attendee_emails

    result_text = await _call_workspace_tool(
        user_id,
        tokens,
        "calendar.createEvent",
        event_args,
    )
    event = json.loads(result_text)
    event_id = event.get("id")
    html_link = event.get("htmlLink", "")
    meet_link = event.get("hangoutLink", "")
    pieces = [f'Scheduled "{event.get("summary", title)}" for {start_iso}.']
    if html_link:
        pieces.append(f"[Open in Google Calendar]({html_link})")
    if meet_link:
        pieces.append(f"[Google Meet]({meet_link})")
    return {
        "result": " ".join(pieces),
        "event_id": event_id,
        "url": html_link,
        "meet_url": meet_link,
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
    base_url = str(request.base_url)
    if "run.app" in base_url:
        base_url = base_url.replace("http://", "https://")
    callback_url = f"{base_url.rstrip('/')}/auth/callback"
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
        os.environ["USER_TIMEZONE_OFFSET"] = request.timezone_offset

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


class DraftEmailBodyRequest(BaseModel):
    payload: dict
    user_id: str = "default_user"


class ParseIntentPayloadRequest(BaseModel):
    intent: str
    text: str
    payload: dict
    user_id: str = "default_user"


@app.get("/api/google-docs")
async def list_google_docs(
    user_id: str = "default_user",
    query: str = "",
    page_size: int = 20,
):
    """List Google Docs the user can access for picker UI fields."""
    return await list_google_files(user_id, "document", query, page_size)


@app.get("/api/google-files")
async def list_google_files(
    user_id: str = "default_user",
    file_type: str = "document",
    query: str = "",
    page_size: int = 20,
):
    """List Google Workspace files the user can access for picker UI fields."""
    tokens = get_user_tokens(user_id)
    if tokens is None:
        raise HTTPException(status_code=401, detail="Unauthenticated")

    try:
        tokens = refresh_tokens_if_needed(user_id) or tokens
    except Exception as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    file_configs = {
        "document": {
            "mime": "application/vnd.google-apps.document",
            "url": "https://docs.google.com/document/d/{id}/edit",
        },
        "spreadsheet": {
            "mime": "application/vnd.google-apps.spreadsheet",
            "url": "https://docs.google.com/spreadsheets/d/{id}/edit",
        },
        "presentation": {
            "mime": "application/vnd.google-apps.presentation",
            "url": "https://docs.google.com/presentation/d/{id}/edit",
        },
        "workspace": {
            "mime": "",
            "url": "",
        },
    }
    config = file_configs.get(file_type)
    if not config:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_type}")

    safe_query = query.replace("\\", "\\\\").replace("'", "\\'")
    if file_type == "workspace":
        drive_query = (
            "("
            "mimeType='application/vnd.google-apps.document' or "
            "mimeType='application/vnd.google-apps.presentation' or "
            "mimeType='application/vnd.google-apps.spreadsheet'"
            ") and trashed=false"
        )
    else:
        drive_query = f"mimeType='{config['mime']}' and trashed=false"
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
            mime_type = file.get("mimeType", "")
            if mime_type == "application/vnd.google-apps.document":
                url = f"https://docs.google.com/document/d/{file_id}/edit"
            elif mime_type == "application/vnd.google-apps.presentation":
                url = f"https://docs.google.com/presentation/d/{file_id}/edit"
            elif mime_type == "application/vnd.google-apps.spreadsheet":
                url = f"https://docs.google.com/spreadsheets/d/{file_id}/edit"
            else:
                url = config["url"].format(id=file_id) if config["url"] else f"https://drive.google.com/file/d/{file_id}/view"
            docs.append(
                {
                    "id": file_id,
                    "name": file.get("name") or "Untitled document",
                    "modifiedTime": file.get("modifiedTime"),
                    "mimeType": mime_type,
                    "url": url,
                }
            )
        return {"files": docs, "docs": docs}
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list Google Docs: {str(exc)}",
        )


@app.post("/api/draft-email-body")
async def draft_email_body(request: DraftEmailBodyRequest):
    """Draft an editable email body after the user confirms subject/context."""
    _get_and_refresh_tokens_or_401(request.user_id)

    payload = request.payload or {}
    subject = (payload.get("subject") or "").strip()
    recipient = (payload.get("to") or "").strip()
    content_type = (payload.get("content_type") or "email").strip()
    tone = (payload.get("tone") or "professional").strip()
    sender = (payload.get("sender") or "").strip()
    attachment = (payload.get("attachment") or "").strip()

    if not subject:
        raise HTTPException(
            status_code=400,
            detail="Add an email subject before drafting the body.",
        )

    client = _get_genai_client()
    prompt = f"""
Draft a ready-to-edit email body for the user's email composer.

Return ONLY plain text body content. Do not include the subject line. Do not wrap in Markdown.

Context:
- Recipient(s): {recipient or "Not specified"}
- Email type: {content_type}
- Tone: {tone}
- Subject: {subject}
- Sender/from name: {sender or "Not specified"}
- Attachment/link note: {attachment or "None"}

Requirements:
- Write a clear, readable email with intentional line breaks.
- Put a blank line between the greeting, each paragraph, any list, and the sign-off.
- Keep paragraphs to 1 or 2 sentences each.
- If there are 3 or more details, use a short hyphen-bullet list with one item per line.
- Match the requested tone without sounding robotic.
- Include a greeting when a recipient is known; otherwise use a neutral greeting.
- If attachment/link note is provided, mention it naturally.
- If sender/from name is provided, sign off with that name; otherwise use a simple sign-off without inventing a name.
- Do not invent specific facts, dates, promises, or contact details not provided by the user.
""".strip()

    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
    except ClientError as exc:
        code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        if code == 429:
            raise HTTPException(
                status_code=429,
                detail="Gemini quota exhausted. Please wait a moment and try again.",
            )
        raise

    body = (response.text or "").strip()
    body = re.sub(r"^```(?:text|markdown)?\s*|\s*```$", "", body).strip()
    if not body:
        raise HTTPException(status_code=500, detail="The email draft came back empty.")
    return {"body": body}


@app.post("/api/parse-intent-payload")
async def parse_intent_payload(request: ParseIntentPayloadRequest):
    """Parse a one-sentence user instruction into editable action fields."""
    tokens = _get_and_refresh_tokens_or_401(request.user_id)

    intent = (request.intent or "").strip()
    text = (request.text or "").strip()
    template = request.payload or {}
    allowed_keys = [
        key for key in template.keys()
        if key not in {"local_attachments"} and not key.startswith("__")
    ]

    if not intent or not allowed_keys:
        raise HTTPException(status_code=400, detail="Missing action type or editable fields.")
    if not text:
        raise HTTPException(status_code=400, detail="Type one sentence before asking AI to fill the blocks.")

    intent_hints = {
        "send_email": (
            "Extract recipient emails, email type, tone, subject, body/message details, sender/from name, "
            "and attachment/link/file-name mentions. If no exact recipient email is present, leave to blank."
        ),
        "schedule_event": (
            "Extract event title, date, start time, duration, attendee emails, description/agenda, "
            "and whether the user asked for Google Meet."
        ),
        "do_format": "Extract source text, Doc link, or mentioned Doc file name, desired action, style, and tone.",
        "execute_summary": "Extract Google Doc link or mentioned Doc file name, desired summary length, and focus.",
        "summarize_slides": "Extract Google Slides link or mentioned Slides deck name, desired summary style or length, and focus.",
        "data_analysis": "Extract Google Sheet link or mentioned Sheet file name and the analysis questions.",
        "generate_docs": "Extract document title, content type, outline/request, depth, and tone.",
    }

    client = _get_genai_client()
    prompt = f"""
Parse the user's natural-language request into fields for this action form.

Return ONLY JSON with this shape:
{{
  "payload": {{
    "field_name": "field value"
  }},
  "missing": ["field_name"],
  "notes": "short helpful note"
}}

Action: {intent}
Allowed fields: {allowed_keys}
Current empty/template payload:
{json.dumps(template, ensure_ascii=False)}

Parsing guidance:
- {intent_hints.get(intent, "Extract only fields explicitly supported by the allowed fields.")}
- Fill only allowed fields.
- Use empty string for unknown fields.
- Do not invent emails, links, file IDs, dates, times, names, or facts.
- If the user mentions a Google file by name without a URL, put that exact file name in the relevant file/link field so the server can search Drive.
- Normalize obvious dates/times only when the user's wording is clear.
- For yes/no fields, use "Yes" or "No".
- For lists in a single field, use comma-separated plain text unless the template value is an array.
- Keep generated text concise but useful.

User sentence:
{text}
""".strip()

    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        parsed = json.loads(response.text or "{}")
    except ClientError as exc:
        code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        if code == 429:
            raise HTTPException(
                status_code=429,
                detail="Gemini quota exhausted. Please wait a moment and try again.",
            )
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not parse the request: {str(exc)}")

    raw_payload = parsed.get("payload") if isinstance(parsed, dict) else {}
    if not isinstance(raw_payload, dict):
        raw_payload = {}

    cleaned_payload = {}
    for key in allowed_keys:
        value = raw_payload.get(key, "")
        if value is None:
            value = ""
        if isinstance(template.get(key), list) and isinstance(value, str):
            value = [item.strip() for item in value.split(",") if item.strip()]
        elif not isinstance(value, (str, int, float, bool, list, dict)):
            value = str(value)
        cleaned_payload[key] = value

    workspace_urls = await _resolve_workspace_urls_from_text(request.user_id, tokens, text)

    def first_url_for(mime_type: str) -> str:
        for item in workspace_urls:
            if item.get("mimeType") == mime_type:
                return item.get("url") or ""
        return ""

    def ensure_field_url(field: str, url: str) -> None:
        if field in allowed_keys and url and not str(cleaned_payload.get(field) or "").strip():
            cleaned_payload[field] = url

    ensure_field_url("source_doc_link", first_url_for("application/vnd.google-apps.document"))
    ensure_field_url("presentation_link", first_url_for("application/vnd.google-apps.presentation"))
    ensure_field_url("sheet_link", first_url_for("application/vnd.google-apps.spreadsheet"))

    file_field_mimes = {
        "source_doc_link": "application/vnd.google-apps.document",
        "presentation_link": "application/vnd.google-apps.presentation",
        "sheet_link": "application/vnd.google-apps.spreadsheet",
    }
    for field, mime_type in file_field_mimes.items():
        value = str(cleaned_payload.get(field) or "").strip()
        if field in allowed_keys and value and not _extract_urls(value):
            found_url = await _find_workspace_file_url_by_name(
                request.user_id,
                tokens,
                value,
                mime_type,
            )
            if found_url:
                cleaned_payload[field] = found_url

    if "text_or_doc_link" in allowed_keys and not str(cleaned_payload.get("text_or_doc_link") or "").strip():
        ensure_field_url("text_or_doc_link", first_url_for("application/vnd.google-apps.document"))
        if not str(cleaned_payload.get("text_or_doc_link") or "").strip() and workspace_urls:
            cleaned_payload["text_or_doc_link"] = workspace_urls[0]["url"]
    elif "text_or_doc_link" in allowed_keys:
        value = str(cleaned_payload.get("text_or_doc_link") or "").strip()
        if value and not _extract_urls(value):
            found_url = await _find_workspace_file_url_by_name(
                request.user_id,
                tokens,
                value,
                "application/vnd.google-apps.document",
            )
            if found_url:
                cleaned_payload["text_or_doc_link"] = found_url

    if "attachment" in allowed_keys and workspace_urls:
        existing_attachment = str(cleaned_payload.get("attachment") or "").strip()
        extracted_links = [item["url"] for item in workspace_urls if item.get("url")]
        if extracted_links:
            cleaned_payload["attachment"] = "\n".join(
                dict.fromkeys([link for link in [existing_attachment, *extracted_links] if link])
            )
    elif "attachment" in allowed_keys:
        attachment = str(cleaned_payload.get("attachment") or "").strip()
        if attachment and not _extract_urls(attachment):
            found_url = await _find_workspace_file_url_by_name(
                request.user_id,
                tokens,
                attachment,
            )
            if found_url:
                cleaned_payload["attachment"] = found_url

    if "description" in allowed_keys and intent == "schedule_event" and workspace_urls:
        description = str(cleaned_payload.get("description") or "").strip()
        links_text = "\n".join(item["url"] for item in workspace_urls if item.get("url"))
        if links_text and links_text not in description:
            cleaned_payload["description"] = (
                f"{description}\n\nRelated file:\n{links_text}".strip()
            )

    missing = parsed.get("missing", []) if isinstance(parsed, dict) else []
    if not isinstance(missing, list):
        missing = []

    return {
        "payload": cleaned_payload,
        "missing": [key for key in missing if key in allowed_keys],
        "notes": parsed.get("notes", "") if isinstance(parsed, dict) else "",
    }


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
        body_html = _email_plain_text_to_html(payload.get("body", ""))
        attachment_links = await _resolve_attachment_links(
            user_id,
            tokens,
            str(payload.get("attachment") or ""),
        )
        local_attachments = _normalize_local_attachments(payload)
        body_html = _append_attachment_links_to_html(body_html, attachment_links)
        
        server_params = StdioServerParameters(command="node", args=[str(_WORKSPACE_DIST), "--use-dot-names"], env=env)
        try:
            async with stdio_client(server_params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    # Directly invoke the gmail.send MCP tool
                    mcp_args = {
                        "to": payload.get("to", ""),
                        "subject": payload.get("subject", ""),
                        "body": body_html,
                        "isHtml": True
                    }
                    if "cc" in payload and payload["cc"]:
                        mcp_args["cc"] = payload["cc"]
                    if local_attachments:
                        mcp_args["attachments"] = local_attachments
                    
                    result = await session.call_tool("gmail.send", arguments=mcp_args)
                    text_content = next((item.text for item in result.content if item.type == 'text'), str(result.content))
                    try:
                        send_result = json.loads(text_content)
                        if isinstance(send_result, dict) and send_result.get("error"):
                            raise RuntimeError(send_result["error"])
                    except json.JSONDecodeError:
                        pass
                    attachment_note = (
                        (
                            f" Included {len(attachment_links)} attachment link(s)"
                            f" and {len(local_attachments)} local file(s)."
                        )
                        if attachment_links or local_attachments
                        else ""
                    )
                    return {"result": f"Email sent successfully!{attachment_note}"}
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

    if intent == "summarize_slides":
        try:
            return await _execute_slides_summary(user_id, tokens, payload)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Slides summary failed: {str(exc)}",
            )

    if intent == "generate_docs":
        try:
            return await _execute_generate_document(user_id, tokens, payload)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Document creation failed: {str(exc)}",
            )

    if intent == "schedule_event":
        try:
            return await _execute_schedule_event(user_id, tokens, payload)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Event scheduling failed: {str(exc)}",
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
