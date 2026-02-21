"""
WebSocket hub for real-time server console output.
Persists logs to daily files in each server's directory.
"""

import json
import logging
import os
import time
from collections import deque
from datetime import datetime
from pathlib import Path

from fastapi import WebSocket

logger = logging.getLogger("minepanel.console")

BUFFER_SIZE = 1000
DATA_DIR = Path(os.getenv("DATA_DIR", "data"))
SERVERS_DIR = DATA_DIR / "servers"


class ConsoleManager:
    def __init__(self):
        # In-memory ring buffer per server for fast access
        self._buffers: dict[str, deque] = {}
        # Active WebSocket subscribers: server_id -> set of WebSocket
        self._subscribers: dict[str, set[WebSocket]] = {}
        # Current open log file handles
        self._log_files: dict[str, tuple[str, object]] = {}  # server_id -> (date_str, file)

    def _ensure_buffer(self, server_id: str):
        if server_id not in self._buffers:
            self._buffers[server_id] = deque(maxlen=BUFFER_SIZE)

    def _log_dir(self, server_id: str) -> Path:
        return SERVERS_DIR / server_id / "logs" / "panel"

    def _get_log_file(self, server_id: str):
        """Get or open the log file for today."""
        today = datetime.now().strftime("%Y-%m-%d")
        cached = self._log_files.get(server_id)
        if cached and cached[0] == today:
            return cached[1]

        # Close old file if date changed
        if cached:
            try:
                cached[1].close()
            except Exception:
                pass

        log_dir = self._log_dir(server_id)
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / f"{today}.log"
        f = open(log_path, "a", encoding="utf-8", buffering=1)  # line-buffered
        self._log_files[server_id] = (today, f)
        return f

    def _write_to_file(self, server_id: str, line: str):
        """Append a log line to today's log file."""
        try:
            f = self._get_log_file(server_id)
            ts = datetime.now().strftime("%H:%M:%S")
            f.write(f"[{ts}] {line}\n")
        except Exception as e:
            logger.warning("Failed to write log for %s: %s", server_id, e)

    def add_line(self, server_id: str, line: str):
        """Add a log line from server stdout."""
        self._ensure_buffer(server_id)
        entry = {
            "type": "log",
            "line": line,
            "timestamp": time.time(),
        }
        self._buffers[server_id].append(entry)
        self._write_to_file(server_id, line)

    async def broadcast(self, server_id: str, message: dict):
        """Send a message to all WebSocket subscribers of a server."""
        subscribers = self._subscribers.get(server_id, set())
        dead = []
        payload = json.dumps(message)
        for ws in subscribers:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            subscribers.discard(ws)

    async def broadcast_line(self, server_id: str, line: str):
        """Add a line and broadcast to subscribers."""
        self.add_line(server_id, line)
        entry = {
            "type": "log",
            "line": line,
            "timestamp": time.time(),
        }
        await self.broadcast(server_id, entry)

    async def broadcast_status(self, server_id: str, status: str):
        """Broadcast a status change to subscribers."""
        self._write_to_file(server_id, f"[MinePanel] Server {status}")
        await self.broadcast(server_id, {
            "type": "status",
            "status": status,
        })

    def subscribe(self, server_id: str, ws: WebSocket):
        if server_id not in self._subscribers:
            self._subscribers[server_id] = set()
        self._subscribers[server_id].add(ws)

    def unsubscribe(self, server_id: str, ws: WebSocket):
        if server_id in self._subscribers:
            self._subscribers[server_id].discard(ws)

    def get_history(self, server_id: str) -> list[dict]:
        """Get buffered log lines. If buffer is empty, load from today's log file."""
        self._ensure_buffer(server_id)
        buf = self._buffers[server_id]
        if len(buf) > 0:
            return list(buf)

        # Buffer empty (e.g. after restart) — load from latest log file
        return self._load_from_files(server_id)

    def _load_from_files(self, server_id: str) -> list[dict]:
        """Load recent lines from log files on disk."""
        log_dir = self._log_dir(server_id)
        if not log_dir.exists():
            return []

        # Get log files sorted newest first
        log_files = sorted(log_dir.glob("*.log"), reverse=True)
        if not log_files:
            return []

        lines = []
        for log_file in log_files[:2]:  # at most 2 newest files
            try:
                content = log_file.read_text(encoding="utf-8", errors="replace")
                file_lines = content.strip().split("\n") if content.strip() else []
                lines = file_lines + lines
            except Exception as e:
                logger.warning("Failed to read log %s: %s", log_file, e)
            if len(lines) >= BUFFER_SIZE:
                break

        # Take last BUFFER_SIZE lines
        lines = lines[-BUFFER_SIZE:]

        entries = []
        for line in lines:
            # Parse [HH:MM:SS] prefix if present
            text = line
            if line.startswith("[") and "]" in line[:10]:
                text = line[line.index("]") + 2:]
            entries.append({
                "type": "log",
                "line": text,
                "timestamp": 0,
            })

        # Populate in-memory buffer
        self._ensure_buffer(server_id)
        self._buffers[server_id].extend(entries)

        return entries

    def clear(self, server_id: str):
        """Clear in-memory buffer for a server."""
        if server_id in self._buffers:
            self._buffers[server_id].clear()

    def close_all(self):
        """Close all open log file handles."""
        for server_id, (_, f) in self._log_files.items():
            try:
                f.close()
            except Exception:
                pass
        self._log_files.clear()
