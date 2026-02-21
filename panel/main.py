"""
MinePanel — Minecraft server management panel.
FastAPI app with REST API and WebSocket console.
"""

import json
import logging
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

import aiohttp
from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from panel import database as db
from panel import jar_manager
from panel.console_manager import ConsoleManager
from panel.metrics_collector import MetricsCollector
from panel.server_manager import ServerManager

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(name)s: %(message)s")
logger = logging.getLogger("minepanel")

# ─── Globals ─────────────────────────────────────────────────────────────────

console_mgr = ConsoleManager()
server_mgr = ServerManager(console_mgr)
metrics_collector = MetricsCollector(server_mgr)


async def _on_status_change(server_id: str, status: str):
    await db.set_status(server_id, status)

server_mgr.set_status_callback(_on_status_change)


# ─── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    # Startup
    await db.init()
    # Reset stale "running" statuses from previous unclean shutdown
    await db.reset_running_servers()
    session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60))
    jar_manager.set_session(session)
    await metrics_collector.start()
    logger.info("MinePanel starting...")

    yield

    # Shutdown
    logger.info("MinePanel shutting down...")
    await metrics_collector.stop()
    await server_mgr.stop_all()
    console_mgr.close_all()
    await session.close()
    await db.close()


app = FastAPI(
    title="MinePanel API",
    description="Minecraft server management panel",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def ok(data):
    return JSONResponse({"status": "ok", "data": data})


def error(message: str, code: int = 400):
    return JSONResponse({"status": "error", "message": message}, status_code=code)


def _enrich_server(server: dict) -> dict:
    """Add runtime info (status, uptime) to server dict."""
    sid = server["id"]
    if server_mgr.is_running(sid):
        server["status"] = "running"
        info = server_mgr.get_info(sid)
        if info:
            server["uptime"] = info["uptime"]
            server["pid"] = info["pid"]
    return server


# ═══════════════════════════════════════════════════════════════════════════════
# SERVER CRUD
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/servers")
async def list_servers():
    servers = await db.get_servers()
    return ok([_enrich_server(s) for s in servers])


@app.get("/api/servers/{server_id}")
async def get_server(server_id: str):
    server = await db.get_server(server_id)
    if not server:
        return error("Server not found", 404)
    return ok(_enrich_server(server))


@app.post("/api/servers")
async def create_server(request: Request):
    body = await request.json()

    required = ["name", "jar_type", "jar_version"]
    for field in required:
        if field not in body:
            return error(f"Missing required field: {field}")

    if not body.get("eula"):
        return error("You must accept the Minecraft EULA (eula: true)")

    try:
        # Create DB record (jar_file set after download)
        server = await db.create_server({
            "name": body["name"],
            "jar_type": body["jar_type"],
            "jar_version": body["jar_version"],
            "jar_file": "",
            "port": body.get("port"),
            "min_ram": body.get("min_ram", "1G"),
            "max_ram": body.get("max_ram", "2G"),
            "jvm_args": body.get("jvm_args", ""),
            "auto_restart": body.get("auto_restart", False),
        })
    except ValueError as e:
        return error(str(e))

    server_id = server["id"]
    server_dir = server_mgr.server_dir(server_id)

    # Download JAR
    try:
        filename = await jar_manager.download_jar(
            body["jar_type"], body["jar_version"], server_dir
        )
        await db.update_server(server_id, {})  # trigger update
        # Update jar_file in DB
        await db._db.execute(
            "UPDATE servers SET jar_file = ? WHERE id = ?", (filename, server_id)
        )
        await db._db.commit()
    except Exception as e:
        # Clean up on failure
        logger.error("JAR download failed for %s: %s", server_id, e)
        await db.delete_server(server_id)
        if server_dir.exists():
            shutil.rmtree(server_dir)
        return error(f"Failed to download JAR: {e}", 500)

    # Write eula.txt
    (server_dir / "eula.txt").write_text("eula=true\n")

    server = await db.get_server(server_id)
    return JSONResponse({"status": "ok", "data": server}, status_code=201)


@app.patch("/api/servers/{server_id}")
async def update_server(server_id: str, request: Request):
    body = await request.json()
    try:
        server = await db.update_server(server_id, body)
    except ValueError as e:
        return error(str(e))
    if not server:
        return error("Server not found", 404)
    return ok(_enrich_server(server))


@app.delete("/api/servers/{server_id}")
async def delete_server(server_id: str):
    if server_mgr.is_running(server_id):
        return error("Stop the server before deleting it")

    server = await db.get_server(server_id)
    if not server:
        return error("Server not found", 404)

    # Delete files
    server_dir = server_mgr.server_dir(server_id)
    if server_dir.exists():
        shutil.rmtree(server_dir)

    await db.delete_server(server_id)
    return ok({"deleted": server_id})


# ═══════════════════════════════════════════════════════════════════════════════
# SERVER CONTROLS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/servers/{server_id}/start")
async def start_server(server_id: str):
    server = await db.get_server(server_id)
    if not server:
        return error("Server not found", 404)
    try:
        await server_mgr.start(
            server_id=server_id,
            jar_file=server["jar_file"],
            port=server["port"],
            min_ram=server["min_ram"],
            max_ram=server["max_ram"],
            jvm_args=server.get("jvm_args", ""),
            auto_restart=bool(server.get("auto_restart", 0)),
        )
    except Exception as e:
        return error(str(e))
    return ok({"status": "running"})


@app.post("/api/servers/{server_id}/stop")
async def stop_server(server_id: str):
    try:
        await server_mgr.stop(server_id)
    except Exception as e:
        return error(str(e))
    return ok({"status": "stopped"})


@app.post("/api/servers/{server_id}/restart")
async def restart_server(server_id: str):
    server = await db.get_server(server_id)
    if not server:
        return error("Server not found", 404)
    try:
        await server_mgr.restart(server_id, server)
    except Exception as e:
        return error(str(e))
    return ok({"status": "running"})


@app.post("/api/servers/{server_id}/command")
async def send_command(server_id: str, request: Request):
    body = await request.json()
    command = body.get("command", "").strip()
    if not command:
        return error("Missing command")
    try:
        await server_mgr.send_command(server_id, command)
    except Exception as e:
        return error(str(e))
    return ok({"sent": command})


# ═══════════════════════════════════════════════════════════════════════════════
# SERVER CONFIG (server.properties)
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_properties(content: str) -> dict:
    """Parse server.properties content into a dict."""
    props = {}
    for line in content.split("\n"):
        line = line.strip()
        if line and not line.startswith("#"):
            if "=" in line:
                key, _, value = line.partition("=")
                props[key.strip()] = value.strip()
    return props


def _write_properties(original: str, new_props: dict) -> str:
    """Rebuild server.properties preserving comments, updating values."""
    written = set()
    lines = []
    for line in original.split("\n"):
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key, _, _ = stripped.partition("=")
            key = key.strip()
            if key in new_props:
                lines.append(f"{key}={new_props[key]}")
                written.add(key)
            else:
                lines.append(line)
        else:
            lines.append(line)
    # Append new keys not in original
    for key, value in new_props.items():
        if key not in written:
            lines.append(f"{key}={value}")
    return "\n".join(lines)


@app.get("/api/servers/{server_id}/config")
async def get_config(server_id: str):
    server = await db.get_server(server_id)
    if not server:
        return error("Server not found", 404)

    props_path = server_mgr.server_dir(server_id) / "server.properties"
    if not props_path.exists():
        return ok({"properties": {}, "raw": ""})

    content = props_path.read_text()
    return ok({"properties": _parse_properties(content), "raw": content})


@app.put("/api/servers/{server_id}/config")
async def update_config(server_id: str, request: Request):
    server = await db.get_server(server_id)
    if not server:
        return error("Server not found", 404)

    body = await request.json()
    properties = body.get("properties", {})

    props_path = server_mgr.server_dir(server_id) / "server.properties"
    original = props_path.read_text() if props_path.exists() else ""
    new_content = _write_properties(original, properties)
    props_path.write_text(new_content)

    # Sync port to DB if changed
    if "server-port" in properties:
        try:
            new_port = int(properties["server-port"])
            await db.update_server(server_id, {"port": new_port})
        except (ValueError, Exception) as e:
            logger.warning("Failed to sync port to DB: %s", e)

    return ok({"saved": True})


# ═══════════════════════════════════════════════════════════════════════════════
# FILE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

MAX_READ_SIZE = 2 * 1024 * 1024   # 2 MB
MAX_UPLOAD_SIZE = 100 * 1024 * 1024  # 100 MB

TEXT_EXTENSIONS = {
    ".properties", ".txt", ".yml", ".yaml", ".json", ".cfg", ".conf",
    ".log", ".toml", ".ini", ".csv", ".md", ".sh", ".bat", ".xml",
    ".lang", ".mcmeta",
}


def _safe_path(server_id: str, rel_path: str) -> Path:
    """Resolve a relative path within a server directory, blocking traversal."""
    server_dir = server_mgr.server_dir(server_id).resolve()
    target = (server_dir / rel_path).resolve()
    if not str(target).startswith(str(server_dir)):
        raise ValueError("Path traversal not allowed")
    return target


@app.get("/api/servers/{server_id}/files")
async def list_files(server_id: str, request: Request):
    server = await db.get_server(server_id)
    if not server:
        return error("Server not found", 404)

    rel_path = request.query_params.get("path", ".")
    try:
        target = _safe_path(server_id, rel_path)
    except ValueError as e:
        return error(str(e))

    if not target.exists() or not target.is_dir():
        return error("Directory not found", 404)

    entries = []
    for item in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        stat = item.stat()
        entries.append({
            "name": item.name,
            "type": "dir" if item.is_dir() else "file",
            "size": stat.st_size if item.is_file() else 0,
            "modified": int(stat.st_mtime),
        })
    return ok(entries)


@app.get("/api/servers/{server_id}/files/read")
async def read_file(server_id: str, request: Request):
    server = await db.get_server(server_id)
    if not server:
        return error("Server not found", 404)

    rel_path = request.query_params.get("path", "")
    if not rel_path:
        return error("Missing path parameter")

    try:
        target = _safe_path(server_id, rel_path)
    except ValueError as e:
        return error(str(e))

    if not target.exists() or not target.is_file():
        return error("File not found", 404)

    if target.stat().st_size > MAX_READ_SIZE:
        return error("File too large to read (max 2 MB)")

    try:
        content = target.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return error("Cannot read file")

    return ok({"path": rel_path, "content": content})


@app.put("/api/servers/{server_id}/files/write")
async def write_file(server_id: str, request: Request):
    server = await db.get_server(server_id)
    if not server:
        return error("Server not found", 404)

    body = await request.json()
    rel_path = body.get("path", "")
    content = body.get("content", "")

    if not rel_path:
        return error("Missing path")

    try:
        target = _safe_path(server_id, rel_path)
    except ValueError as e:
        return error(str(e))

    if len(content.encode("utf-8")) > MAX_READ_SIZE:
        return error("Content too large (max 2 MB)")

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return ok({"path": rel_path, "size": len(content)})


@app.post("/api/servers/{server_id}/files/upload")
async def upload_file(
    server_id: str,
    file: UploadFile = File(...),
    path: str = Form(default="."),
):
    server = await db.get_server(server_id)
    if not server:
        return error("Server not found", 404)

    try:
        dest_dir = _safe_path(server_id, path)
    except ValueError as e:
        return error(str(e))

    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / file.filename

    # Verify final path is still safe
    if not str(dest.resolve()).startswith(str(server_mgr.server_dir(server_id).resolve())):
        return error("Invalid filename")

    total = 0
    try:
        with open(dest, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_UPLOAD_SIZE:
                    f.close()
                    dest.unlink(missing_ok=True)
                    return error("File too large (max 100 MB)")
                f.write(chunk)
    except Exception as e:
        return error(f"Upload failed: {e}", 500)

    return ok({"name": file.filename, "size": total})


@app.post("/api/servers/{server_id}/files/mkdir")
async def mkdir_file(server_id: str, request: Request):
    server = await db.get_server(server_id)
    if not server:
        return error("Server not found", 404)

    body = await request.json()
    rel_path = body.get("path", "")
    if not rel_path:
        return error("Missing path")

    try:
        target = _safe_path(server_id, rel_path)
    except ValueError as e:
        return error(str(e))

    target.mkdir(parents=True, exist_ok=True)
    return ok({"path": rel_path})


@app.delete("/api/servers/{server_id}/files")
async def delete_file(server_id: str, request: Request):
    server = await db.get_server(server_id)
    if not server:
        return error("Server not found", 404)

    rel_path = request.query_params.get("path", "")
    if not rel_path or rel_path == ".":
        return error("Cannot delete root directory")

    try:
        target = _safe_path(server_id, rel_path)
    except ValueError as e:
        return error(str(e))

    if not target.exists():
        return error("File not found", 404)

    # Protect server.jar
    if target.name == "server.jar":
        return error("Cannot delete server.jar")

    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()

    return ok({"deleted": rel_path})


# ═══════════════════════════════════════════════════════════════════════════════
# JAR PROXY
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/jars/types")
async def get_jar_types():
    types = await jar_manager.get_types()
    return ok(types)


@app.get("/api/jars/versions/{jar_type}")
async def get_jar_versions(jar_type: str):
    versions = await jar_manager.get_versions(jar_type)
    return ok(versions)


# ═══════════════════════════════════════════════════════════════════════════════
# WEBSOCKET CONSOLE
# ═══════════════════════════════════════════════════════════════════════════════

@app.websocket("/ws/console/{server_id}")
async def ws_console(websocket: WebSocket, server_id: str):
    server = await db.get_server(server_id)
    if not server:
        await websocket.close(code=4004, reason="Server not found")
        return

    await websocket.accept()
    console_mgr.subscribe(server_id, websocket)

    # Send history
    history = console_mgr.get_history(server_id)
    for entry in history:
        await websocket.send_text(json.dumps(entry))

    # Send current status
    status = "running" if server_mgr.is_running(server_id) else server["status"]
    await websocket.send_text(json.dumps({"type": "status", "status": status}))

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "command" and msg.get("value"):
                if server_mgr.is_running(server_id):
                    await server_mgr.send_command(server_id, msg["value"])
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("WebSocket error for %s: %s", server_id, e)
    finally:
        console_mgr.unsubscribe(server_id, websocket)


# ═══════════════════════════════════════════════════════════════════════════════
# ANALYTICS / METRICS
# ═══════════════════════════════════════════════════════════════════════════════

import time as _time

_PERIOD_SECONDS = {"1h": 3600, "6h": 6 * 3600, "24h": 24 * 3600}


@app.get("/api/analytics/system")
async def analytics_system():
    """Current live system metrics."""
    return ok(metrics_collector.get_system_snapshot())


@app.get("/api/analytics/servers")
async def analytics_servers():
    """Current live metrics for all running servers."""
    snapshots = metrics_collector.get_all_server_snapshots()
    for snap in snapshots:
        server = await db.get_server(snap["server_id"])
        if server:
            snap["name"] = server["name"]
            snap["jar_type"] = server["jar_type"]
            snap["port"] = server["port"]
    return ok(snapshots)


@app.get("/api/analytics/history")
async def analytics_system_history(period: str = "1h"):
    """Historical system metrics for the given period."""
    seconds = _PERIOD_SECONDS.get(period, 3600)
    since = _time.time() - seconds
    rows = await db.get_metrics_history("system", since=since)
    return ok(rows)


@app.get("/api/analytics/servers/{server_id}/history")
async def analytics_server_history(server_id: str, period: str = "1h"):
    """Historical metrics for a specific server."""
    server = await db.get_server(server_id)
    if not server:
        return error("Server not found", 404)
    seconds = _PERIOD_SECONDS.get(period, 3600)
    since = _time.time() - seconds
    rows = await db.get_metrics_history("server", server_id=server_id, since=since)
    return ok(rows)


# ═══════════════════════════════════════════════════════════════════════════════
# STATIC FILES (React build in production)
# ═══════════════════════════════════════════════════════════════════════════════

static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve static files or fall back to index.html for SPA routing."""
        file_path = static_dir / full_path
        if full_path and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(static_dir / "index.html")
