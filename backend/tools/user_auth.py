import base64
import json
import os
from typing import Optional
from urllib.parse import quote
import httpx

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
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid"
]

TOKEN_FILE = ".tokens.json"

def _find_client_secret():
    candidates = ["new_secret.json", "agent_gworkspace_client_secret.json", "client_secret.json"]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def _load_tokens():
    if os.path.exists(TOKEN_FILE):
        try:
            with open(TOKEN_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _save_tokens(data):
    with open(TOKEN_FILE, "w") as f:
        json.dump(data, f)

def get_user_tokens(user_id: str) -> Optional[dict]:
    data = _load_tokens()
    return data.get(user_id)

def save_user_tokens(user_id: str, tokens: dict) -> None:
    data = _load_tokens()
    data[user_id] = tokens
    _save_tokens(data)

def delete_user_tokens(user_id: str) -> None:
    data = _load_tokens()
    if user_id in data:
        del data[user_id]
        _save_tokens(data)

def list_authenticated_users() -> list[str]:
    return list(_load_tokens().keys())

def generate_login_url(user_id: str, callback_url: str) -> str:
    secret_file = _find_client_secret()
    if secret_file:
        with open(secret_file, "r") as f:
            client_config = json.load(f)
            
        if "web" in client_config:
            client_id = client_config["web"]["client_id"]
        else:
            client_id = client_config["installed"]["client_id"]
            
        state_data = {"uri": callback_url, "user_id": user_id}
        state = base64.urlsafe_b64encode(json.dumps(state_data).encode()).decode()
        
        params = {
            "client_id": client_id,
            "redirect_uri": callback_url,
            "response_type": "code",
            "scope": " ".join(DEFAULT_SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        qs = "&".join(f"{k}={quote(v, safe='')}" for k, v in params.items())
        return f"https://accounts.google.com/o/oauth2/v2/auth?{qs}"
    else:
        raise RuntimeError("Missing client_secret.json file! Please place your Google OAuth credentials here.")

def process_oauth_callback(
    code: str,
    state_csrf: str,
) -> str:
    try:
        padded = state_csrf + '=' * (-len(state_csrf) % 4)
        state_data = json.loads(base64.urlsafe_b64decode(padded).decode())
    except Exception as e:
        raise ValueError(f"Invalid state parameter: {e}")
        
    user_id = state_data.get("user_id", "default_user")
    callback_url = state_data.get("uri")

    secret_file = _find_client_secret()
    with open(secret_file, "r") as f:
        client_config = json.load(f)
        
    if "web" in client_config:
        client_id = client_config["web"]["client_id"]
        client_secret = client_config["web"]["client_secret"]
    else:
        client_id = client_config["installed"]["client_id"]
        client_secret = client_config["installed"]["client_secret"]

    resp = httpx.post("https://oauth2.googleapis.com/token", data={
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": callback_url
    })
    
    if resp.status_code != 200:
        raise ValueError(f"Failed to fetch token: {resp.text}")
        
    data = resp.json()

    import time
    expiry_ms = int((time.time() + data["expires_in"]) * 1000)

    tokens = {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token"),
        "token_type": "Bearer",
        "expiry_date": expiry_ms,
        "scope": " ".join(DEFAULT_SCOPES)
    }
    save_user_tokens(user_id, tokens)
    return user_id

def refresh_tokens_if_needed(user_id: str) -> Optional[dict]:
    tokens = get_user_tokens(user_id)
    if not tokens:
        return None

    import time
    expiry = tokens.get("expiry_date", 0) / 1000
    
    if time.time() > (expiry - 300):
        if not tokens.get("refresh_token"):
            raise ValueError("Token expired and no refresh token available")
            
        secret_file = _find_client_secret()
        with open(secret_file, "r") as f:
            client_config = json.load(f)
            
        if "web" in client_config:
            client_id = client_config["web"]["client_id"]
            client_secret = client_config["web"]["client_secret"]
        else:
            client_id = client_config["installed"]["client_id"]
            client_secret = client_config["installed"]["client_secret"]
        
        resp = httpx.post("https://oauth2.googleapis.com/token", data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": tokens["refresh_token"],
            "grant_type": "refresh_token"
        })
        if resp.status_code != 200:
            raise ValueError(f"Failed to refresh token: {resp.text}")
        
        new_data = resp.json()
        tokens["access_token"] = new_data["access_token"]
        if "refresh_token" in new_data:
            tokens["refresh_token"] = new_data["refresh_token"]
        
        tokens["expiry_date"] = int((time.time() + new_data["expires_in"]) * 1000)
        save_user_tokens(user_id, tokens)
        
    return tokens
