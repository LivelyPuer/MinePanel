"""
Integration with ServerJars API for JAR downloads.
"""

import logging
import os
from pathlib import Path

import aiohttp

logger = logging.getLogger("minepanel.jars")

SERVERJARS_URL = os.getenv("SERVERJARS_URL", "http://localhost:8580")

_session: aiohttp.ClientSession | None = None


def set_session(session: aiohttp.ClientSession):
    global _session
    _session = session


async def get_types() -> dict:
    """Fetch all JAR categories and types from ServerJars API."""
    try:
        async with _session.get(f"{SERVERJARS_URL}/api/fetchTypes") as resp:
            if resp.status == 200:
                data = await resp.json()
                if data.get("status") == "success":
                    return data["response"]
    except Exception as e:
        logger.warning("Failed to fetch types from ServerJars: %s", e)
    return {}


async def get_versions(jar_type: str, max_count: int = 30) -> list[dict]:
    """Fetch available versions for a JAR type."""
    try:
        url = f"{SERVERJARS_URL}/api/fetchAll/{jar_type}?max={max_count}"
        async with _session.get(url) as resp:
            if resp.status == 200:
                data = await resp.json()
                if data.get("status") == "success":
                    return data["response"]
    except Exception as e:
        logger.warning("Failed to fetch versions for %s: %s", jar_type, e)
    return []


async def get_latest(jar_type: str) -> dict | None:
    """Fetch the latest version info for a JAR type."""
    try:
        url = f"{SERVERJARS_URL}/api/fetchLatest/{jar_type}"
        async with _session.get(url) as resp:
            if resp.status == 200:
                data = await resp.json()
                if data.get("status") == "success":
                    return data["response"]
    except Exception as e:
        logger.warning("Failed to fetch latest for %s: %s", jar_type, e)
    return None


async def download_jar(jar_type: str, version: str, dest_dir: Path) -> str:
    """Download a JAR file to the destination directory.

    Returns the filename of the downloaded JAR.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)

    # Get version info to find download URL and filename
    versions = await get_versions(jar_type, max_count=100)
    target = None
    for v in versions:
        if v.get("version") == version:
            target = v
            break

    if not target:
        # Try latest
        target = await get_latest(jar_type)
        if not target:
            raise ValueError(f"Cannot find version {version} for {jar_type}")

    download_url = target.get("download_url")
    filename = target.get("file", f"{jar_type}-{version}.jar")

    if not download_url:
        # Use the fetchJar redirect endpoint
        download_url = f"{SERVERJARS_URL}/api/fetchJar/{jar_type}/{version}"

    # Download the JAR
    dest_path = dest_dir / "server.jar"
    logger.info("Downloading %s to %s", download_url, dest_path)

    try:
        async with _session.get(download_url, allow_redirects=True) as resp:
            if resp.status != 200:
                raise ValueError(
                    f"Download failed with status {resp.status}: {download_url}"
                )
            content = await resp.read()
            dest_path.write_bytes(content)
    except aiohttp.ClientError as e:
        raise ValueError(f"Download failed: {e}") from e

    logger.info("Downloaded %s (%d bytes)", filename, dest_path.stat().st_size)
    return filename
