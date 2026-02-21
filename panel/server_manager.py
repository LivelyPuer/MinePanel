"""
Minecraft server process management.
"""

import asyncio
import logging
import os
import time
from pathlib import Path

from panel.console_manager import ConsoleManager

logger = logging.getLogger("minepanel.servers")

DATA_DIR = Path(os.getenv("DATA_DIR", "data"))
SERVERS_DIR = DATA_DIR / "servers"
JAVA_PATH = os.getenv("JAVA_PATH", "java")
STOP_TIMEOUT = 15  # seconds to wait after "stop" before kill


class ServerProcess:
    """Tracks a single running MC server process."""

    def __init__(self, server_id: str, process: asyncio.subprocess.Process):
        self.server_id = server_id
        self.process = process
        self.started_at = time.time()
        self.reader_task: asyncio.Task | None = None

    @property
    def uptime(self) -> float:
        return time.time() - self.started_at

    @property
    def pid(self) -> int | None:
        return self.process.pid


class ServerManager:
    def __init__(self, console: ConsoleManager):
        self.console = console
        self._processes: dict[str, ServerProcess] = {}
        self._stopping: set[str] = set()  # servers being explicitly stopped
        # Callback to update DB status — set from main.py
        self._on_status_change = None

    def set_status_callback(self, callback):
        """Set async callback: callback(server_id, status)"""
        self._on_status_change = callback

    def is_running(self, server_id: str) -> bool:
        sp = self._processes.get(server_id)
        return sp is not None and sp.process.returncode is None

    def get_info(self, server_id: str) -> dict | None:
        sp = self._processes.get(server_id)
        if not sp:
            return None
        return {
            "pid": sp.pid,
            "uptime": int(sp.uptime),
            "running": sp.process.returncode is None,
        }

    def server_dir(self, server_id: str) -> Path:
        return SERVERS_DIR / server_id

    async def start(
        self,
        server_id: str,
        jar_file: str,
        port: int,
        min_ram: str,
        max_ram: str,
        jvm_args: str = "",
        auto_restart: bool = False,
    ):
        if self.is_running(server_id):
            raise RuntimeError(f"Server {server_id} is already running")

        cwd = self.server_dir(server_id)
        if not cwd.exists():
            raise FileNotFoundError(f"Server directory not found: {cwd}")

        jar_path = cwd / "server.jar"
        if not jar_path.exists():
            raise FileNotFoundError(f"JAR file not found: {jar_path}")

        # Ensure eula.txt exists
        eula_path = cwd / "eula.txt"
        if not eula_path.exists():
            eula_path.write_text("eula=true\n")

        # Ensure server.properties has correct port
        props_path = cwd / "server.properties"
        self._ensure_port(props_path, port)

        # Build JVM command
        cmd = [JAVA_PATH, f"-Xms{min_ram}", f"-Xmx{max_ram}"]
        if jvm_args:
            cmd.extend(jvm_args.split())
        cmd.extend(["-jar", "server.jar", "nogui"])

        logger.info("Starting server %s: %s (cwd=%s)", server_id, " ".join(cmd), cwd)

        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(cwd),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        sp = ServerProcess(server_id, process)
        self._processes[server_id] = sp

        # Start stdout reader task
        sp.reader_task = asyncio.create_task(
            self._read_output(server_id, process, auto_restart)
        )

        await self._set_status(server_id, "running")
        await self.console.broadcast_status(server_id, "running")

    async def stop(self, server_id: str):
        sp = self._processes.get(server_id)
        if not sp or sp.process.returncode is not None:
            raise RuntimeError(f"Server {server_id} is not running")

        logger.info("Stopping server %s (pid=%s)", server_id, sp.pid)
        self._stopping.add(server_id)

        # Send "stop" command to Minecraft
        await self.send_command(server_id, "stop")

        # Wait for graceful shutdown
        try:
            await asyncio.wait_for(sp.process.wait(), timeout=STOP_TIMEOUT)
            logger.info("Server %s stopped gracefully", server_id)
        except asyncio.TimeoutError:
            logger.warning("Server %s did not stop in %ds, killing", server_id, STOP_TIMEOUT)
            sp.process.kill()
            await sp.process.wait()

    async def restart(self, server_id: str, server_config: dict):
        """Stop and start a server with given config."""
        if self.is_running(server_id):
            await self.stop(server_id)
            # Wait briefly for process cleanup
            await asyncio.sleep(1)

        await self.start(
            server_id=server_id,
            jar_file=server_config["jar_file"],
            port=server_config["port"],
            min_ram=server_config["min_ram"],
            max_ram=server_config["max_ram"],
            jvm_args=server_config.get("jvm_args", ""),
            auto_restart=bool(server_config.get("auto_restart", 0)),
        )

    async def send_command(self, server_id: str, command: str):
        sp = self._processes.get(server_id)
        if not sp or sp.process.returncode is not None:
            raise RuntimeError(f"Server {server_id} is not running")
        if sp.process.stdin:
            sp.process.stdin.write(f"{command}\n".encode())
            await sp.process.stdin.drain()

    async def _read_output(
        self,
        server_id: str,
        process: asyncio.subprocess.Process,
        auto_restart: bool,
    ):
        """Read stdout line by line and broadcast to console."""
        try:
            while True:
                line = await process.stdout.readline()
                if not line:
                    break
                text = line.decode("utf-8", errors="replace").rstrip("\n\r")
                if text:
                    await self.console.broadcast_line(server_id, text)
        except Exception as e:
            logger.warning("Output reader error for %s: %s", server_id, e)

        # Process has exited
        exit_code = process.returncode
        logger.info("Server %s exited with code %s", server_id, exit_code)

        # Clean up
        if server_id in self._processes:
            del self._processes[server_id]

        explicitly_stopped = server_id in self._stopping
        self._stopping.discard(server_id)

        if explicitly_stopped:
            await self._set_status(server_id, "stopped")
            await self.console.broadcast_status(server_id, "stopped")
        elif exit_code != 0 and auto_restart:
            await self._set_status(server_id, "crashed")
            await self.console.broadcast_status(server_id, "crashed")
            await self.console.broadcast_line(
                server_id,
                f"[MinePanel] Server crashed (exit code {exit_code}). Restarting in 5s..."
            )
            await asyncio.sleep(5)
            # auto-restart would need server config — handled by main.py
        else:
            status = "stopped" if exit_code == 0 else "crashed"
            await self._set_status(server_id, status)
            await self.console.broadcast_status(server_id, status)

    async def _set_status(self, server_id: str, status: str):
        if self._on_status_change:
            await self._on_status_change(server_id, status)

    def _ensure_port(self, props_path: Path, port: int):
        """Ensure server.properties has the correct port."""
        if props_path.exists():
            content = props_path.read_text()
            lines = content.split("\n")
            new_lines = []
            port_found = False
            for line in lines:
                if line.startswith("server-port="):
                    new_lines.append(f"server-port={port}")
                    port_found = True
                else:
                    new_lines.append(line)
            if not port_found:
                new_lines.append(f"server-port={port}")
            props_path.write_text("\n".join(new_lines))
        else:
            props_path.write_text(f"server-port={port}\n")

    async def stop_all(self):
        """Stop all running servers (called on shutdown)."""
        running = [sid for sid in self._processes if self.is_running(sid)]
        if running:
            logger.info("Stopping %d running server(s)...", len(running))
            for sid in running:
                try:
                    await self.stop(sid)
                except Exception as e:
                    logger.warning("Error stopping server %s: %s", sid, e)
