"""Per-user Google Workspace MCP toolset factory.

Each user_id gets its own MCP server process with their OAuth tokens
injected via environment variables. The MCP server's AuthManager reads
WORKSPACE_ACCESS_TOKEN / WORKSPACE_REFRESH_TOKEN on startup.
"""

import os
import pathlib
from typing import Optional

from google.adk.tools.mcp_tool.mcp_toolset import (
    MCPToolset,
    StdioConnectionParams,
    StdioServerParameters,
)

_HERE = pathlib.Path(__file__).parent.parent
_WORKSPACE_DIST = _HERE.parent / "workspace" / "workspace-server" / "dist" / "index.js"

# Cache of per-user MCPToolset instances  (user_id → toolset)
_user_toolsets: dict[str, MCPToolset] = {}


def get_workspace_mcp_toolset(
    user_id: str = "default_user",
    tokens: Optional[dict] = None,
) -> MCPToolset:
    """Return (or create) an MCPToolset for *user_id*.

    Args:
        user_id:  Unique identifier for the user.  Each user_id spawns a
                  dedicated MCP server process.
        tokens:   Optional dict with keys ``access_token``, ``refresh_token``,
                  ``expiry_date``, ``scope``.  When supplied the MCP server
                  receives them as environment variables so it can skip its
                  own browser-based OAuth flow.

    Returns:
        An ``MCPToolset`` wired to that user's MCP server process.
    """
    if user_id in _user_toolsets:
        return _user_toolsets[user_id]

    env = {**os.environ, "WORKSPACE_USER_ID": user_id, "WORKSPACE_ENABLE_LOGGING": "true"}

    if tokens:
        env["WORKSPACE_ACCESS_TOKEN"] = tokens.get("access_token", "")
        env["WORKSPACE_TOKEN_SCOPE"] = tokens.get("scope", "")

    toolset = MCPToolset(
        connection_params=StdioConnectionParams(
            timeout=300.0,
            server_params=StdioServerParameters(
                command="node",
                args=[str(_WORKSPACE_DIST), "--use-dot-names"],
                env=env,
            )
        )
    )

    _user_toolsets[user_id] = toolset
    return toolset


def invalidate_user_toolset(user_id: str) -> None:
    """Remove a cached toolset so a fresh one is spawned on next call."""
    _user_toolsets.pop(user_id, None)
