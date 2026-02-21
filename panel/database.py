"""
SQLite database for MinePanel server metadata.
"""

import os
import uuid
from pathlib import Path

import aiosqlite

DB_PATH = Path(os.getenv("DATA_DIR", "data")) / "panel.db"
MC_PORT_MIN = int(os.getenv("MC_PORT_MIN", "25565"))
MC_PORT_MAX = int(os.getenv("MC_PORT_MAX", "25600"))

_db: aiosqlite.Connection | None = None


async def init():
    """Initialize the database and create tables."""
    global _db
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    _db = await aiosqlite.connect(str(DB_PATH))
    _db.row_factory = aiosqlite.Row
    await _db.execute("""
        CREATE TABLE IF NOT EXISTS servers (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            jar_type    TEXT NOT NULL,
            jar_version TEXT NOT NULL,
            jar_file    TEXT NOT NULL,
            port        INTEGER NOT NULL UNIQUE,
            min_ram     TEXT DEFAULT '1G',
            max_ram     TEXT DEFAULT '2G',
            jvm_args    TEXT DEFAULT '',
            auto_restart INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now')),
            status      TEXT DEFAULT 'stopped'
        )
    """)
    await _db.execute("""
        CREATE TABLE IF NOT EXISTS metrics (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp    REAL NOT NULL,
            metric_type  TEXT NOT NULL,
            server_id    TEXT,
            cpu_percent  REAL,
            ram_used_mb  REAL,
            ram_total_mb REAL,
            ram_percent  REAL,
            disk_used_gb REAL,
            disk_total_gb REAL,
            disk_percent REAL
        )
    """)
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_metrics_type_ts ON metrics(metric_type, timestamp)"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_metrics_server_ts ON metrics(server_id, timestamp)"
    )
    await _db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            username            TEXT NOT NULL UNIQUE,
            password_hash       TEXT NOT NULL,
            must_change_password INTEGER DEFAULT 1,
            created_at          TEXT DEFAULT (datetime('now'))
        )
    """)
    await _db.commit()


async def close():
    """Close the database connection."""
    global _db
    if _db:
        await _db.close()
        _db = None


def _row_to_dict(row: aiosqlite.Row) -> dict:
    return dict(row)


async def get_servers() -> list[dict]:
    async with _db.execute("SELECT * FROM servers ORDER BY created_at DESC") as cur:
        rows = await cur.fetchall()
    return [_row_to_dict(r) for r in rows]


async def get_server(server_id: str) -> dict | None:
    async with _db.execute("SELECT * FROM servers WHERE id = ?", (server_id,)) as cur:
        row = await cur.fetchone()
    return _row_to_dict(row) if row else None


async def get_used_ports() -> set[int]:
    async with _db.execute("SELECT port FROM servers") as cur:
        rows = await cur.fetchall()
    return {r[0] for r in rows}


async def next_free_port() -> int | None:
    """Find the first free port in the configured range."""
    used = await get_used_ports()
    for port in range(MC_PORT_MIN, MC_PORT_MAX + 1):
        if port not in used:
            return port
    return None


async def create_server(data: dict) -> dict:
    server_id = str(uuid.uuid4())
    port = data.get("port")

    if port is None:
        port = await next_free_port()
        if port is None:
            raise ValueError("No free ports available in range "
                             f"{MC_PORT_MIN}-{MC_PORT_MAX}")
    else:
        if not (MC_PORT_MIN <= port <= MC_PORT_MAX):
            raise ValueError(f"Port must be between {MC_PORT_MIN} and {MC_PORT_MAX}")
        used = await get_used_ports()
        if port in used:
            raise ValueError(f"Port {port} is already in use")

    await _db.execute(
        """INSERT INTO servers (id, name, jar_type, jar_version, jar_file, port,
                                min_ram, max_ram, jvm_args, auto_restart)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            server_id,
            data["name"],
            data["jar_type"],
            data["jar_version"],
            data.get("jar_file", ""),
            port,
            data.get("min_ram", "1G"),
            data.get("max_ram", "2G"),
            data.get("jvm_args", ""),
            1 if data.get("auto_restart") else 0,
        ),
    )
    await _db.commit()
    return await get_server(server_id)


async def update_server(server_id: str, data: dict) -> dict | None:
    existing = await get_server(server_id)
    if not existing:
        return None

    allowed = {"name", "min_ram", "max_ram", "jvm_args", "auto_restart", "port"}
    updates = {k: v for k, v in data.items() if k in allowed}

    if "port" in updates:
        port = updates["port"]
        if not (MC_PORT_MIN <= port <= MC_PORT_MAX):
            raise ValueError(f"Port must be between {MC_PORT_MIN} and {MC_PORT_MAX}")
        used = await get_used_ports()
        if port in used and port != existing["port"]:
            raise ValueError(f"Port {port} is already in use")

    if "auto_restart" in updates:
        updates["auto_restart"] = 1 if updates["auto_restart"] else 0

    if not updates:
        return existing

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [server_id]
    await _db.execute(f"UPDATE servers SET {set_clause} WHERE id = ?", values)
    await _db.commit()
    return await get_server(server_id)


async def delete_server(server_id: str) -> bool:
    async with _db.execute("DELETE FROM servers WHERE id = ?", (server_id,)) as cur:
        deleted = cur.rowcount > 0
    await _db.commit()
    return deleted


async def set_status(server_id: str, status: str):
    await _db.execute(
        "UPDATE servers SET status = ? WHERE id = ?", (status, server_id)
    )
    await _db.commit()


async def reset_running_servers():
    """Reset all 'running' servers to 'stopped' (called on startup after unclean shutdown)."""
    await _db.execute(
        "UPDATE servers SET status = 'stopped' WHERE status = 'running'"
    )
    await _db.commit()


# ─── Metrics ────────────────────────────────────────────────────────────────

async def insert_metric(data: dict):
    """Insert a single metrics row."""
    await _db.execute(
        """INSERT INTO metrics (timestamp, metric_type, server_id, cpu_percent,
                                ram_used_mb, ram_total_mb, ram_percent,
                                disk_used_gb, disk_total_gb, disk_percent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            data["timestamp"],
            data["metric_type"],
            data.get("server_id"),
            data.get("cpu_percent"),
            data.get("ram_used_mb"),
            data.get("ram_total_mb"),
            data.get("ram_percent"),
            data.get("disk_used_gb"),
            data.get("disk_total_gb"),
            data.get("disk_percent"),
        ),
    )
    await _db.commit()


async def get_metrics_history(
    metric_type: str,
    server_id: str | None = None,
    since: float = 0,
) -> list[dict]:
    """Fetch metrics rows filtered by type, optionally by server_id, since a timestamp."""
    if server_id:
        sql = """SELECT * FROM metrics
                 WHERE metric_type = ? AND server_id = ? AND timestamp >= ?
                 ORDER BY timestamp ASC"""
        params = (metric_type, server_id, since)
    else:
        sql = """SELECT * FROM metrics
                 WHERE metric_type = ? AND timestamp >= ?
                 ORDER BY timestamp ASC"""
        params = (metric_type, since)

    async with _db.execute(sql, params) as cur:
        rows = await cur.fetchall()
    return [_row_to_dict(r) for r in rows]


async def delete_metrics_before(cutoff: float):
    """Delete metrics rows older than the cutoff timestamp."""
    await _db.execute("DELETE FROM metrics WHERE timestamp < ?", (cutoff,))
    await _db.commit()


# ─── Users ──────────────────────────────────────────────────────────────

async def get_user_by_username(username: str) -> dict | None:
    async with _db.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ) as cur:
        row = await cur.fetchone()
    return _row_to_dict(row) if row else None


async def get_user_by_id(user_id: int) -> dict | None:
    async with _db.execute(
        "SELECT * FROM users WHERE id = ?", (user_id,)
    ) as cur:
        row = await cur.fetchone()
    return _row_to_dict(row) if row else None


async def user_count() -> int:
    async with _db.execute("SELECT COUNT(*) FROM users") as cur:
        row = await cur.fetchone()
    return row[0]


async def create_user(username: str, password_hash: str, must_change: bool = True) -> dict:
    await _db.execute(
        "INSERT INTO users (username, password_hash, must_change_password) VALUES (?, ?, ?)",
        (username, password_hash, 1 if must_change else 0),
    )
    await _db.commit()
    return await get_user_by_username(username)


async def update_user_credentials(user_id: int, username: str, password_hash: str) -> dict:
    await _db.execute(
        "UPDATE users SET username = ?, password_hash = ?, must_change_password = 0 WHERE id = ?",
        (username, password_hash, user_id),
    )
    await _db.commit()
    return await get_user_by_id(user_id)
