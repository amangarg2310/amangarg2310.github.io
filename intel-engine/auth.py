"""
User authentication — Flask-Login integration with SQLite user storage.
"""

import sqlite3
from datetime import datetime, timezone

from flask_login import UserMixin
from werkzeug.security import check_password_hash, generate_password_hash

import config


class User(UserMixin):
    """User model for Flask-Login."""

    def __init__(self, id, email, password_hash, display_name, created_at):
        self.id = id
        self.email = email
        self.password_hash = password_hash
        self.display_name = display_name or email.split("@")[0]
        self.created_at = created_at

    @staticmethod
    def get(user_id):
        """Load user by ID."""
        conn = sqlite3.connect(str(config.DB_PATH))
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.close()
        if row:
            return User(**dict(row))
        return None

    @staticmethod
    def get_by_email(email):
        """Load user by email."""
        conn = sqlite3.connect(str(config.DB_PATH))
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        conn.close()
        if row:
            return User(**dict(row))
        return None

    @staticmethod
    def create(email, password, display_name=None):
        """Create a new user. Returns the User object."""
        conn = sqlite3.connect(str(config.DB_PATH))
        now = datetime.now(timezone.utc).isoformat()
        pw_hash = generate_password_hash(password)

        cursor = conn.execute(
            "INSERT INTO users (email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)",
            (email, pw_hash, display_name, now),
        )
        user_id = cursor.lastrowid

        # Claim any unowned data for the first user
        conn.execute("UPDATE domains SET user_id = ? WHERE user_id IS NULL", (user_id,))
        conn.execute("UPDATE sources SET user_id = ? WHERE user_id IS NULL", (user_id,))

        conn.commit()
        conn.close()

        return User(id=user_id, email=email, password_hash=pw_hash,
                     display_name=display_name, created_at=now)

    def check_password(self, password):
        """Verify password against hash."""
        return check_password_hash(self.password_hash, password)

    @staticmethod
    def count():
        """Count total users."""
        conn = sqlite3.connect(str(config.DB_PATH))
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        conn.close()
        return count
