"""
Per-user OAuth token management.

Stores Google OAuth tokens per user_id in PostgreSQL with Fernet encryption.
Handles:
  - OAuth URL generation (consent screen)
  - Callback processing (code → tokens via cloud function)
  - Token refresh (via cloud function /refreshToken)
  - CSRF state validation
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Optional
from urllib.parse import quote

import httpx
import psycopg2
import psycopg2.extras

# ---------------------------------------------------------------------------
# Configuration — read from env, same as workspace MCP server
# ---------------------------------------------------------------------------

_DEFAULT_CLIENT_ID = (
    "338689075775-o75k922vn5fdl18qergr96rp8g63e4d7.apps.googleusercontent.com"
)
_DEFAULT_CLOUD_FUNCTION_URL = "https://google-workspace-extension.geminicli.com"


def _get_client_id() -> str:
    print(os.environ.get("WORKSPACE_CLIENT_ID", _DEFAULT_CLIENT_ID))
    return os.environ.get("WORKSPACE_CLIENT_ID", _DEFAULT_CLIENT_ID)


def _get_cloud_function_url() -> str:
    return os.environ.get("WORKSPACE_CLOUD_FUNCTION_URL", _DEFAULT_CLOUD_FUNCTION_URL)

# Scopes matching the workspace MCP server defaults
DEFAULT_SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.labels",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/chat.spaces",
    "https://www.googleapis.com/auth/chat.messages",
    "https://www.googleapis.com/auth/chat.memberships",
    "https://mail.google.com/",
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/directory.readonly",
    "https://www.googleapis.com/auth/tasks",
]

# ---------------------------------------------------------------------------
# Encryption — derive key from TOKEN_ENCRYPTION_KEY env var (or generate once)
# ---------------------------------------------------------------------------

TOKEN_EXPIRY_BUFFER_S = 5 * 60  # refresh 5 min before expiry


def _get_fernet_key() -> bytes:
    """Derive a stable Fernet key from TOKEN_ENCRYPTION_KEY env var."""
    raw_b64 = os.environ.get("TOKEN_ENCRYPTION_KEY", "")
    if raw_b64:
        raw = base64.urlsafe_b64decode(raw_b64 + "=" * (-len(raw_b64) % 4))
    else:
        # Fall back to a fixed seed so tokens survive in-container restarts
        # (will break across redeploys without the env var set)
        raw = hashlib.sha256(b"agent47-default-key").digest()
    return base64.urlsafe_b64encode(hashlib.sha256(raw).digest())


_FERNET_KEY = _get_fernet_key()
# Raw 32-byte key used for HMAC (same secret, just decoded)
_HMAC_KEY = base64.urlsafe_b64decode(_FERNET_KEY)


def _encrypt(plaintext: str) -> str:
    from cryptography.fernet import Fernet

    return Fernet(_FERNET_KEY).encrypt(plaintext.encode()).decode()


def _decrypt(ciphertext: str) -> str:
    from cryptography.fernet import Fernet

    return Fernet(_FERNET_KEY).decrypt(ciphertext.encode()).decode()


# ---------------------------------------------------------------------------
# PostgreSQL setup
# ---------------------------------------------------------------------------

_DATABASE_URL = os.environ.get("DATABASE_URL", "")


def _conn() -> psycopg2.extensions.connection:
    conn = psycopg2.connect(_DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    return conn


def _init() -> None:
    c = _conn()
    cur = c.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS user_tokens (
            user_id       TEXT PRIMARY KEY,
            tokens_enc    TEXT NOT NULL,
            created_at    DOUBLE PRECISION NOT NULL,
            updated_at    DOUBLE PRECISION NOT NULL
        );
        CREATE TABLE IF NOT EXISTS oauth_states (
            state         TEXT PRIMARY KEY,
            user_id       TEXT NOT NULL,
            csrf          TEXT NOT NULL,
            created_at    DOUBLE PRECISION NOT NULL
        );
        """
    )
    c.commit()
    cur.close()
    c.close()


_init()


# ---------------------------------------------------------------------------
# Token CRUD
# ---------------------------------------------------------------------------


def save_user_tokens(user_id: str, tokens: dict) -> None:
    """Encrypt and store tokens for a user."""
    enc = _encrypt(json.dumps(tokens))
    now = time.time()
    c = _conn()
    cur = c.cursor()
    cur.execute(
        """
        INSERT INTO user_tokens (user_id, tokens_enc, created_at, updated_at)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT(user_id) DO UPDATE SET tokens_enc=EXCLUDED.tokens_enc, updated_at=EXCLUDED.updated_at
        """,
        (user_id, enc, now, now),
    )
    c.commit()
    cur.close()
    c.close()


def get_user_tokens(user_id: str) -> Optional[dict]:
    """Return decrypted tokens dict or None."""
    c = _conn()
    cur = c.cursor()
    cur.execute("SELECT tokens_enc FROM user_tokens WHERE user_id=%s", (user_id,))
    row = cur.fetchone()
    cur.close()
    c.close()
    if row is None:
        return None
    return json.loads(_decrypt(row["tokens_enc"]))


def delete_user_tokens(user_id: str) -> None:
    c = _conn()
    cur = c.cursor()
    cur.execute("DELETE FROM user_tokens WHERE user_id=%s", (user_id,))
    c.commit()
    cur.close()
    c.close()


def list_authenticated_users() -> list[str]:
    c = _conn()
    cur = c.cursor()
    cur.execute("SELECT user_id FROM user_tokens")
    rows = cur.fetchall()
    cur.close()
    c.close()
    return [r["user_id"] for r in rows]


# ---------------------------------------------------------------------------
# OAuth state management (CSRF protection)
# ---------------------------------------------------------------------------


def _save_oauth_state(state_key: str, user_id: str, csrf: str) -> None:
    c = _conn()
    cur = c.cursor()
    cur.execute(
        """
        INSERT INTO oauth_states (state, user_id, csrf, created_at)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT(state) DO UPDATE SET user_id=EXCLUDED.user_id, csrf=EXCLUDED.csrf, created_at=EXCLUDED.created_at
        """,
        (state_key, user_id, csrf, time.time()),
    )
    c.commit()
    cur.close()
    c.close()


def _pop_oauth_state(state_key: str) -> Optional[dict]:
    """Retrieve and delete an oauth_state entry (one-time use)."""
    c = _conn()
    cur = c.cursor()
    cur.execute("SELECT * FROM oauth_states WHERE state=%s", (state_key,))
    row = cur.fetchone()
    if row:
        cur.execute("DELETE FROM oauth_states WHERE state=%s", (state_key,))
        c.commit()
    cur.close()
    c.close()
    return dict(row) if row else None


def _cleanup_stale_states(max_age_s: float = 600) -> None:
    """Remove states older than max_age_s."""
    c = _conn()
    cur = c.cursor()
    cur.execute(
        "DELETE FROM oauth_states WHERE created_at < %s",
        (time.time() - max_age_s,),
    )
    c.commit()
    c.close()


# ---------------------------------------------------------------------------
# Stateless CSRF helpers — no DB required, survives restarts / DB wipes
# ---------------------------------------------------------------------------


def _make_stateless_csrf(user_id: str) -> str:
    """Return a self-verifying token that encodes *user_id*.

    Format: ``<user_b64>.<nonce>.<hmac_sig>``
    The HMAC signs ``user_b64.nonce`` with the installation secret so the
    token cannot be forged and the user_id can be recovered without any DB.
    """
    nonce = secrets.token_hex(16)
    user_b64 = base64.urlsafe_b64encode(user_id.encode()).decode().rstrip("=")
    payload = f"{user_b64}.{nonce}"
    sig = hmac.new(_HMAC_KEY, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def _verify_stateless_csrf(token: str) -> Optional[str]:
    """Verify a stateless CSRF token and return *user_id*, or None if invalid."""
    parts = token.split(".")
    if len(parts) != 3:
        return None
    user_b64, nonce, sig = parts
    payload = f"{user_b64}.{nonce}"
    expected = hmac.new(_HMAC_KEY, payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    # Restore base64 padding
    padded = user_b64 + "=" * (-len(user_b64) % 4)
    try:
        return base64.urlsafe_b64decode(padded).decode()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# OAuth URL generation
# ---------------------------------------------------------------------------


def generate_login_url(user_id: str, callback_url: str) -> str:
    """Build the Google OAuth consent URL for a given user.

    Args:
        user_id: Unique identifier for the user.
        callback_url: The full URL of this server's /auth/callback endpoint
                      (e.g. http://localhost:8000/auth/callback).

    Returns:
        The URL the user should visit to grant permissions.
    """
    # Stateless: user_id is encoded inside the CSRF token itself — no DB write needed.
    csrf = _make_stateless_csrf(user_id)
    state_payload = {
        "uri": callback_url,
        "manual": False,
        "csrf": csrf,
    }
    state_b64 = base64.b64encode(json.dumps(state_payload).encode()).decode()

    params = {
        "client_id": _get_client_id(),
        "redirect_uri": _get_cloud_function_url(),  # Google redirects to CF first
        "response_type": "code",
        "scope": " ".join(DEFAULT_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state_b64,
    }
    qs = "&".join(f"{k}={quote(v, safe='')}" for k, v in params.items())
    return f"https://accounts.google.com/o/oauth2/v2/auth?{qs}"


# ---------------------------------------------------------------------------
# OAuth callback handler
# ---------------------------------------------------------------------------


def process_oauth_callback(
    access_token: str,
    refresh_token: Optional[str],
    scope: str,
    token_type: str,
    expiry_date: str,
    state_csrf: str,
) -> str:
    """Validate the CSRF state and store tokens.  Returns the user_id."""
    user_id = _verify_stateless_csrf(state_csrf)
    if user_id is None:
        raise ValueError("Invalid or expired OAuth state — possible CSRF attack.")

    tokens = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "scope": scope,
        "token_type": token_type,
        "expiry_date": int(expiry_date),
    }
    save_user_tokens(user_id, tokens)
    return user_id


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------


def refresh_tokens_if_needed(user_id: str) -> Optional[dict]:
    """Check expiry and refresh via cloud function if needed.

    Returns the (possibly refreshed) tokens dict, or None if not authenticated.
    """
    tokens = get_user_tokens(user_id)
    if tokens is None:
        return None

    expiry = tokens.get("expiry_date", 0)
    now_ms = int(time.time() * 1000)
    if expiry > now_ms + TOKEN_EXPIRY_BUFFER_S * 1000:
        return tokens  # still valid

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        return tokens  # can't refresh, return as-is

    # Call cloud function /refreshToken
    resp = httpx.post(
        f"{_get_cloud_function_url()}/refreshToken",
        json={"refresh_token": refresh_token},
        timeout=15,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Token refresh failed: {resp.status_code} {resp.text}")

    new = resp.json()
    tokens["access_token"] = new["access_token"]
    tokens["expiry_date"] = new["expiry_date"]
    if "scope" in new:
        tokens["scope"] = new["scope"]
    save_user_tokens(user_id, tokens)
    return tokens
