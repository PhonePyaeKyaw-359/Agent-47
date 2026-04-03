"""
Local time utilities as plain Python functions (no dot-notation names).
These replace MCP time.* tools in the calendar agent to avoid LLM
namespace-stripping hallucinations.
"""

from datetime import datetime, timezone


def get_current_time() -> dict:
    """Returns the current local date, time, UTC offset, and timezone name.

    Returns:
        A dict with keys:
            local_datetime: ISO 8601 local datetime with UTC offset, e.g. '2026-04-03T14:30:00+07:00'
            utc_datetime:   ISO 8601 UTC datetime, e.g. '2026-04-03T07:30:00+00:00'
            timezone_name:  Local timezone abbreviation, e.g. 'ICT', 'EST', 'UTC'
            utc_offset:     UTC offset string, e.g. '+07:00'
    """
    now_local = datetime.now().astimezone()
    now_utc = datetime.now(timezone.utc)
    offset = now_local.strftime("%z")          # e.g. +0700
    offset_fmt = f"{offset[:3]}:{offset[3:]}"  # e.g. +07:00
    return {
        "local_datetime": now_local.isoformat(timespec="seconds"),
        "utc_datetime": now_utc.isoformat(timespec="seconds"),
        "timezone_name": now_local.strftime("%Z"),
        "utc_offset": offset_fmt,
    }
