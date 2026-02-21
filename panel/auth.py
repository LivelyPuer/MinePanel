"""
Authentication module for MinePanel.
Session-based auth with PBKDF2 password hashing.
"""

import hashlib
import hmac
import logging
import os
import secrets
import time

from panel import database as db

logger = logging.getLogger("minepanel.auth")

# ─── Password Hashing ────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash a password with a random salt using PBKDF2-SHA256.
    Format: salt$hash (both hex-encoded)."""
    salt = os.urandom(32)
    pw_hash = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return salt.hex() + "$" + pw_hash.hex()


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against a stored salt$hash string."""
    try:
        salt_hex, hash_hex = stored_hash.split("$", 1)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
        return hmac.compare_digest(actual, expected)
    except (ValueError, AttributeError):
        return False


# ─── Session Management (in-memory) ──────────────────────────────────────

# Maps session_token -> {"user_id": int, "username": str, "created_at": float}
_sessions: dict[str, dict] = {}

SESSION_MAX_AGE = 24 * 60 * 60  # 24 hours


def create_session(user_id: int, username: str) -> str:
    token = secrets.token_urlsafe(32)
    _sessions[token] = {
        "user_id": user_id,
        "username": username,
        "created_at": time.time(),
    }
    return token


def get_session(token: str) -> dict | None:
    session = _sessions.get(token)
    if not session:
        return None
    if time.time() - session["created_at"] > SESSION_MAX_AGE:
        _sessions.pop(token, None)
        return None
    return session


def delete_session(token: str):
    _sessions.pop(token, None)


def clear_all_sessions():
    _sessions.clear()


# ─── Default User Setup ──────────────────────────────────────────────────

DEFAULT_USERNAME = "admin"
DEFAULT_PASSWORD = "admin"


async def ensure_default_user():
    """Create the default admin user if no users exist."""
    count = await db.user_count()
    if count == 0:
        pw_hash = hash_password(DEFAULT_PASSWORD)
        await db.create_user(DEFAULT_USERNAME, pw_hash, must_change=True)
        logger.info("Default admin user created (username: admin)")
    else:
        logger.info("User already exists, skipping default user creation")
