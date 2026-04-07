"""
Local time utilities as plain Python functions (no dot-notation names).
These replace MCP time.* tools in the calendar agent to avoid LLM
namespace-stripping hallucinations.
"""

import contextvars
from datetime import datetime, timezone, timedelta

# Per-request UTC offset, e.g. "+07:00". Set by api.py before each run.
_user_tz_offset: contextvars.ContextVar[str] = contextvars.ContextVar(
    "_user_tz_offset", default=""
)


def set_user_timezone(offset: str) -> None:
    """Set the user's UTC offset for the current async context (e.g. '+07:00')."""
    _user_tz_offset.set(offset)


def get_current_time() -> dict:
    """Returns the current local date, time, UTC offset, and timezone name.

    Uses the user's UTC offset if set via set_user_timezone(), otherwise falls
    back to the server's local timezone.

    Returns:
        A dict with keys:
            local_datetime: ISO 8601 local datetime with UTC offset, e.g. '2026-04-03T14:30:00+07:00'
            utc_datetime:   ISO 8601 UTC datetime, e.g. '2026-04-03T07:30:00+00:00'
            timezone_name:  Local timezone abbreviation, e.g. 'ICT', 'EST', 'UTC'
            utc_offset:     UTC offset string, e.g. '+07:00'
    """
    now_utc = datetime.now(timezone.utc)

    offset_str = _user_tz_offset.get()
    if offset_str:
        # Parse the offset string e.g. "+07:00" or "-05:30"
        sign = 1 if offset_str[0] != "-" else -1
        parts = offset_str.lstrip("+-").split(":")
        hours = int(parts[0])
        minutes = int(parts[1]) if len(parts) > 1 else 0
        tz = timezone(timedelta(hours=sign * hours, minutes=sign * minutes))
        now_local = now_utc.astimezone(tz)
    else:
        now_local = now_utc.astimezone()

    offset = now_local.strftime("%z")          # e.g. +0700
    offset_fmt = f"{offset[:3]}:{offset[3:]}"  # e.g. +07:00
    return {
        "local_datetime": now_local.isoformat(timespec="seconds"),
        "utc_datetime": now_utc.isoformat(timespec="seconds"),
        "timezone_name": now_local.strftime("%Z"),
        "utc_offset": offset_fmt,
    }
