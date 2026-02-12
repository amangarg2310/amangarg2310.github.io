"""
Vertical Manager — CRUD operations for vertical management system.

Handles creating, reading, updating, and deleting verticals and their brands.
"""

import logging
import sqlite3
from datetime import datetime, timezone
from typing import List, Dict, Optional
from dataclasses import dataclass

import config

logger = logging.getLogger(__name__)


@dataclass
class Brand:
    """A brand within a vertical."""
    brand_name: Optional[str]
    instagram_handle: str
    tiktok_handle: Optional[str] = None


@dataclass
class Vertical:
    """A vertical (category) with its brands."""
    name: str
    brands: List[Brand]
    description: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class VerticalManager:
    """Manages verticals and their brands."""

    def __init__(self, db_path=None):
        self.db_path = db_path or config.DB_PATH

    def _get_conn(self):
        """Get database connection with row factory."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def list_verticals(self) -> List[str]:
        """Return list of all vertical names."""
        conn = self._get_conn()
        rows = conn.execute("""
            SELECT name FROM verticals
            ORDER BY updated_at DESC
        """).fetchall()
        conn.close()
        return [row['name'] for row in rows]

    def get_vertical(self, name: str) -> Optional[Vertical]:
        """Load a vertical with all its brands."""
        conn = self._get_conn()

        # Get vertical metadata
        row = conn.execute("""
            SELECT name, description, created_at, updated_at
            FROM verticals
            WHERE name = ?
        """, (name,)).fetchone()

        if not row:
            conn.close()
            return None

        # Get all brands
        brand_rows = conn.execute("""
            SELECT brand_name, instagram_handle, tiktok_handle
            FROM vertical_brands
            WHERE vertical_name = ?
            ORDER BY added_at DESC
        """, (name,)).fetchall()

        conn.close()

        brands = [
            Brand(
                brand_name=b['brand_name'],
                instagram_handle=b['instagram_handle'],
                tiktok_handle=b['tiktok_handle']
            )
            for b in brand_rows
        ]

        return Vertical(
            name=row['name'],
            description=row['description'],
            created_at=row['created_at'],
            updated_at=row['updated_at'],
            brands=brands
        )

    def create_vertical(self, name: str, description: str = None) -> bool:
        """Create a new vertical."""
        conn = self._get_conn()
        now = datetime.now(timezone.utc).isoformat()

        try:
            conn.execute("""
                INSERT INTO verticals (name, description, created_at, updated_at)
                VALUES (?, ?, ?, ?)
            """, (name, description, now, now))
            conn.commit()
            logger.info(f"Created vertical: {name}")
            return True
        except sqlite3.IntegrityError:
            logger.warning(f"Vertical '{name}' already exists")
            return False
        finally:
            conn.close()

    def delete_vertical(self, name: str) -> bool:
        """Delete a vertical and all its brands."""
        conn = self._get_conn()
        conn.execute("DELETE FROM verticals WHERE name = ?", (name,))
        deleted = conn.total_changes > 0
        conn.commit()
        conn.close()

        if deleted:
            logger.info(f"Deleted vertical: {name}")
        return deleted

    def add_brand(self, vertical_name: str, instagram_handle: str = None,
                  brand_name: str = None, tiktok_handle: str = None) -> bool:
        """Add a brand to a vertical. At least one handle (Instagram or TikTok) is required."""
        if not instagram_handle and not tiktok_handle:
            raise ValueError("At least one handle (Instagram or TikTok) is required")

        conn = self._get_conn()
        now = datetime.now(timezone.utc).isoformat()

        # Clean handles (remove @ if present)
        if instagram_handle:
            instagram_handle = instagram_handle.lstrip('@')
        if tiktok_handle:
            tiktok_handle = tiktok_handle.lstrip('@')

        try:
            conn.execute("""
                INSERT INTO vertical_brands
                (vertical_name, brand_name, instagram_handle, tiktok_handle, added_at)
                VALUES (?, ?, ?, ?, ?)
            """, (vertical_name, brand_name, instagram_handle, tiktok_handle, now))
            conn.commit()
            handle_info = instagram_handle or tiktok_handle
            logger.info(f"Added {handle_info} to {vertical_name}")
            return True
        except sqlite3.IntegrityError:
            logger.warning(f"Brand already in {vertical_name}")
            return False
        finally:
            conn.close()

    def remove_brand(self, vertical_name: str, instagram_handle: str) -> bool:
        """Remove a brand from a vertical."""
        conn = self._get_conn()
        instagram_handle = instagram_handle.lstrip('@')

        conn.execute("""
            DELETE FROM vertical_brands
            WHERE vertical_name = ? AND instagram_handle = ?
        """, (vertical_name, instagram_handle))

        deleted = conn.total_changes > 0
        conn.commit()
        conn.close()

        if deleted:
            logger.info(f"Removed @{instagram_handle} from {vertical_name}")
        return deleted

    def bulk_add_brands(self, vertical_name: str, handles_text: str) -> Dict:
        """
        Parse and add multiple brands from text input.
        Accepts formats:
        - @instagram_handle (Instagram only)
        - @handle | tiktok (TikTok only)
        - @instagram | @tiktok (Both platforms)
        - Brand Name, @handle (Legacy format)
        Returns dict with added/skipped counts.
        """
        lines = [line.strip() for line in handles_text.strip().split('\n') if line.strip()]
        added = 0
        skipped = 0

        for line in lines:
            brand_name = None
            instagram_handle = None
            tiktok_handle = None

            # Check for pipe separator (platform format)
            if '|' in line:
                parts = line.split('|', 1)
                left = parts[0].strip().lstrip('@')
                right = parts[1].strip().lstrip('@')

                # Determine which is which
                if right.lower() == 'tiktok':
                    # Format: @handle | tiktok (TikTok only)
                    tiktok_handle = left
                else:
                    # Format: @instagram | @tiktok (Both platforms)
                    instagram_handle = left
                    tiktok_handle = right
            # Check for comma separator (brand name format)
            elif ',' in line:
                parts = line.split(',', 1)
                brand_name = parts[0].strip()
                instagram_handle = parts[1].strip().lstrip('@')
            else:
                # Simple format: just a handle (assume Instagram)
                instagram_handle = line.lstrip('@').strip()

            # Add the brand if we have at least one handle
            if instagram_handle or tiktok_handle:
                try:
                    success = self.add_brand(
                        vertical_name,
                        instagram_handle=instagram_handle,
                        brand_name=brand_name,
                        tiktok_handle=tiktok_handle
                    )
                    if success:
                        added += 1
                    else:
                        skipped += 1
                except ValueError:
                    skipped += 1

        return {'added': added, 'skipped': skipped, 'total': len(lines)}

    def get_brand_count(self, vertical_name: str) -> int:
        """Count brands in a vertical."""
        conn = self._get_conn()
        row = conn.execute("""
            SELECT COUNT(*) as cnt FROM vertical_brands
            WHERE vertical_name = ?
        """, (vertical_name,)).fetchone()
        conn.close()
        return row['cnt'] if row else 0

    def update_vertical_timestamp(self, name: str):
        """Update the updated_at timestamp for a vertical."""
        conn = self._get_conn()
        now = datetime.now(timezone.utc).isoformat()
        conn.execute("""
            UPDATE verticals SET updated_at = ? WHERE name = ?
        """, (now, name))
        conn.commit()
        conn.close()
