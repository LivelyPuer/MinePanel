"""
Resource metrics collection for MinePanel.
Collects system-wide and per-server CPU/RAM/disk metrics every 30 seconds.
"""

import asyncio
import logging
import time

import psutil

from panel import database as db
from panel.server_manager import ServerManager

logger = logging.getLogger("minepanel.metrics")

COLLECT_INTERVAL = 30  # seconds
RETENTION_SECONDS = 24 * 60 * 60  # 24 hours


class MetricsCollector:
    def __init__(self, server_mgr: ServerManager):
        self._server_mgr = server_mgr
        self._task: asyncio.Task | None = None
        self._running = False

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._collection_loop())
        logger.info("Metrics collector started (interval=%ds)", COLLECT_INTERVAL)

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Metrics collector stopped")

    # ─── Background loop ────────────────────────────────────────────────────

    async def _collection_loop(self):
        while self._running:
            try:
                await self._collect()
                await self._cleanup()
            except Exception as e:
                logger.warning("Metrics collection error: %s", e)
            await asyncio.sleep(COLLECT_INTERVAL)

    async def _collect(self):
        ts = time.time()

        # System-wide
        cpu = psutil.cpu_percent(interval=1)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")

        await db.insert_metric({
            "timestamp": ts,
            "metric_type": "system",
            "server_id": None,
            "cpu_percent": cpu,
            "ram_used_mb": mem.used / (1024 * 1024),
            "ram_total_mb": mem.total / (1024 * 1024),
            "ram_percent": mem.percent,
            "disk_used_gb": disk.used / (1024 ** 3),
            "disk_total_gb": disk.total / (1024 ** 3),
            "disk_percent": disk.percent,
        })

        # Per-server
        for server_id, sp in list(self._server_mgr._processes.items()):
            if sp.process.returncode is not None:
                continue
            try:
                proc = psutil.Process(sp.pid)
                with proc.oneshot():
                    cpu_pct = proc.cpu_percent(interval=0)
                    mem_info = proc.memory_info()
                    await db.insert_metric({
                        "timestamp": ts,
                        "metric_type": "server",
                        "server_id": server_id,
                        "cpu_percent": cpu_pct,
                        "ram_used_mb": mem_info.rss / (1024 * 1024),
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

    async def _cleanup(self):
        cutoff = time.time() - RETENTION_SECONDS
        await db.delete_metrics_before(cutoff)

    # ─── Live snapshots (for instant API responses) ─────────────────────────

    def get_system_snapshot(self) -> dict:
        cpu = psutil.cpu_percent(interval=0)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        return {
            "cpu_percent": cpu,
            "ram_used_mb": round(mem.used / (1024 * 1024), 1),
            "ram_total_mb": round(mem.total / (1024 * 1024), 1),
            "ram_percent": mem.percent,
            "disk_used_gb": round(disk.used / (1024 ** 3), 2),
            "disk_total_gb": round(disk.total / (1024 ** 3), 2),
            "disk_percent": disk.percent,
        }

    def get_server_snapshot(self, server_id: str) -> dict | None:
        sp = self._server_mgr._processes.get(server_id)
        if not sp or sp.process.returncode is not None:
            return None
        try:
            proc = psutil.Process(sp.pid)
            with proc.oneshot():
                mem_info = proc.memory_info()
                cpu_pct = proc.cpu_percent(interval=0)
                return {
                    "server_id": server_id,
                    "cpu_percent": cpu_pct,
                    "ram_used_mb": round(mem_info.rss / (1024 * 1024), 1),
                    "pid": sp.pid,
                    "uptime": int(sp.uptime),
                }
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return None

    def get_all_server_snapshots(self) -> list[dict]:
        results = []
        for server_id in self._server_mgr._processes:
            snap = self.get_server_snapshot(server_id)
            if snap:
                results.append(snap)
        return results
