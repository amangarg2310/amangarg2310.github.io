"""
Google OAuth 2.0 authentication for the Outlier Content Engine.

Auth is OPTIONAL — only enforced when Google OAuth credentials
(client_id + client_secret) are configured in the database or environment.
When not configured, all routes are accessible without login.
"""

import logging
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps

import requests
from flask import redirect, request, session, url_for

import config

logger = logging.getLogger(__name__)

# Google OAuth endpoints
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
SCOPES = "openid email profile"


def get_google_credentials():
    """
    Load Google OAuth client_id and client_secret from DB or environment.
    Returns (client_id, client_secret) or (None, None) if not configured.
    """
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")

    # Try database
    if config.DB_PATH.exists():
        try:
            conn = sqlite3.connect(str(config.DB_PATH))
            conn.row_factory = sqlite3.Row
            for service, attr in [("google_client_id", "client_id"),
                                  ("google_client_secret", "client_secret")]:
                row = conn.execute(
                    "SELECT api_key FROM api_credentials WHERE service = ?",
                    (service,)
                ).fetchone()
                if row and row["api_key"]:
                    if attr == "client_id":
                        client_id = row["api_key"]
                    else:
                        client_secret = row["api_key"]
            conn.close()
        except Exception:
            pass

    if client_id and client_secret:
        return client_id, client_secret
    return None, None


def is_auth_enabled():
    """Check if Google OAuth is configured (auth should be enforced)."""
    client_id, client_secret = get_google_credentials()
    return bool(client_id and client_secret)


def get_current_user():
    """Get the current logged-in user from session, or None."""
    return session.get("user")


def get_allowed_emails():
    """
    Load the list of allowed email addresses from the config table.
    Returns a set of lowercase emails, or an empty set (meaning all are allowed).
    """
    if not config.DB_PATH.exists():
        return set()

    try:
        conn = sqlite3.connect(str(config.DB_PATH))
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT value FROM config WHERE key = 'allowed_emails'"
        ).fetchone()
        conn.close()

        if row and row["value"]:
            return {
                e.strip().lower()
                for e in row["value"].split(",")
                if e.strip()
            }
    except Exception:
        pass

    return set()


def is_email_allowed(email: str) -> bool:
    """
    Check if an email is authorized to access the platform.
    If no allowlist is configured, all emails are allowed.
    """
    allowed = get_allowed_emails()
    if not allowed:
        return True  # No allowlist = open access
    return email.strip().lower() in allowed


def login_required(f):
    """
    Decorator that requires login ONLY when auth is enabled.
    When Google OAuth is not configured, passes through freely.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        if not is_auth_enabled():
            return f(*args, **kwargs)

        if not session.get("user"):
            # Store the requested URL for post-login redirect
            session["next_url"] = request.url
            return redirect(url_for("login_page"))

        return f(*args, **kwargs)
    return decorated


def build_google_auth_url(redirect_uri):
    """Build the Google OAuth authorization URL with CSRF state."""
    client_id, _ = get_google_credentials()
    if not client_id:
        return None

    state = secrets.token_urlsafe(32)
    session["oauth_state"] = state

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    }

    query = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return f"{GOOGLE_AUTH_URL}?{query}"


def exchange_code_for_user(code, redirect_uri):
    """
    Exchange the authorization code for tokens and fetch user info.
    Returns user dict or None on failure.
    """
    client_id, client_secret = get_google_credentials()
    if not client_id:
        return None

    # Exchange code for tokens
    token_resp = requests.post(GOOGLE_TOKEN_URL, data={
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }, timeout=10)

    if token_resp.status_code != 200:
        logger.error(f"Token exchange failed: {token_resp.text}")
        return None

    tokens = token_resp.json()
    access_token = tokens.get("access_token")
    if not access_token:
        logger.error("No access_token in token response")
        return None

    # Fetch user info
    userinfo_resp = requests.get(GOOGLE_USERINFO_URL, headers={
        "Authorization": f"Bearer {access_token}",
    }, timeout=10)

    if userinfo_resp.status_code != 200:
        logger.error(f"Userinfo fetch failed: {userinfo_resp.text}")
        return None

    info = userinfo_resp.json()
    return {
        "google_id": info.get("id"),
        "email": info.get("email"),
        "name": info.get("name"),
        "picture": info.get("picture"),
    }


def upsert_user(user_info):
    """Store or update user in the database. Returns the user dict."""
    if not config.DB_PATH.exists():
        return user_info

    now = datetime.now(timezone.utc).isoformat()

    try:
        conn = sqlite3.connect(str(config.DB_PATH))
        conn.execute("""
            INSERT INTO users (google_id, email, name, picture, created_at, last_login)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(google_id) DO UPDATE SET
                email = excluded.email,
                name = excluded.name,
                picture = excluded.picture,
                last_login = excluded.last_login
        """, (
            user_info["google_id"],
            user_info["email"],
            user_info["name"],
            user_info["picture"],
            now,
            now,
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning(f"Failed to upsert user: {e}")

    return user_info
