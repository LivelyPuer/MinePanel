"""
ServerJars API — полная замена serverjars.com
Агрегирует jar-файлы Minecraft серверов из официальных источников.
"""

import asyncio
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse, RedirectResponse

# ─── Config ───────────────────────────────────────────────────────────────────

logger = logging.getLogger("serverjars")

CACHE_DIR = Path(os.getenv("CACHE_DIR", "/data/cache"))
CACHE_TTL = int(os.getenv("CACHE_TTL", 3600))  # 1 hour default
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

# ─── Shared HTTP session (created in lifespan) ──────────────────────────────

_http_session: aiohttp.ClientSession | None = None


def _github_headers() -> dict:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"token {GITHUB_TOKEN}"
    return headers


@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    global _http_session
    timeout = aiohttp.ClientTimeout(total=30)
    _http_session = aiohttp.ClientSession(timeout=timeout)
    logger.info("ServerJars API starting...")
    logger.info("Categories: %d, Types: %d", len(CATEGORIES), sum(len(t) for t in CATEGORIES.values()))
    logger.info("Cache TTL: %ds", CACHE_TTL)

    # Pre-warm caches for all providers in parallel
    logger.info("Warming caches...")
    providers = [info["provider"] for cat in CATEGORIES.values() for info in cat.values()]
    results = await asyncio.gather(*[p() for p in providers], return_exceptions=True)
    succeeded = sum(1 for r in results if not isinstance(r, Exception) and r)
    logger.info("Cache warmup complete: %d/%d providers loaded", succeeded, len(providers))

    yield

    await _http_session.close()
    _http_session = None
    logger.info("ServerJars API shutting down...")


app = FastAPI(
    title="ServerJars API",
    description="Open-source Minecraft server JAR aggregator",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── In-memory cache ─────────────────────────────────────────────────────────

_cache: dict[str, tuple[float, any]] = {}


def cache_get(key: str):
    if key in _cache:
        ts, data = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
        del _cache[key]
    return None


def cache_set(key: str, data):
    _cache[key] = (time.time(), data)


# ─── HTTP helper ──────────────────────────────────────────────────────────────

async def fetch_json(url: str, headers: dict = None, retries: int = 2) -> dict | list | None:
    if _http_session is None:
        return None
    for attempt in range(retries + 1):
        try:
            async with _http_session.get(url, headers=headers or {}) as resp:
                if resp.status == 200:
                    return await resp.json(content_type=None)
                elif resp.status == 429:
                    retry_after = int(resp.headers.get("Retry-After", "5"))
                    logger.warning("Rate limited on %s, retrying in %ds", url, retry_after)
                    await asyncio.sleep(retry_after)
                    continue
                elif resp.status >= 500:
                    logger.warning("Server error %d from %s (attempt %d)", resp.status, url, attempt + 1)
                    if attempt < retries:
                        await asyncio.sleep(2 ** attempt)
                        continue
                else:
                    logger.warning("fetch_json got status %d: %s", resp.status, url)
                    return None
        except asyncio.TimeoutError:
            logger.warning("Timeout fetching %s (attempt %d)", url, attempt + 1)
            if attempt < retries:
                await asyncio.sleep(2 ** attempt)
                continue
        except Exception as e:
            logger.warning("fetch_json failed: %s — %s", url, e)
            return None
    return None


async def fetch_text(url: str, retries: int = 2) -> str | None:
    if _http_session is None:
        return None
    for attempt in range(retries + 1):
        try:
            async with _http_session.get(url) as resp:
                if resp.status == 200:
                    return await resp.text()
                elif resp.status >= 500:
                    logger.warning("Server error %d from %s (attempt %d)", resp.status, url, attempt + 1)
                    if attempt < retries:
                        await asyncio.sleep(2 ** attempt)
                        continue
                else:
                    logger.warning("fetch_text got status %d: %s", resp.status, url)
                    return None
        except asyncio.TimeoutError:
            logger.warning("Timeout fetching %s (attempt %d)", url, attempt + 1)
            if attempt < retries:
                await asyncio.sleep(2 ** attempt)
                continue
        except Exception as e:
            logger.warning("fetch_text failed: %s — %s", url, e)
            return None
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# PROVIDERS — каждый провайдер возвращает list[dict] с ключами:
#   version, file, size (optional), md5/sha256 (optional), download_url
# ═══════════════════════════════════════════════════════════════════════════════


# ─── Vanilla & Snapshot (Mojang) ──────────────────────────────────────────────

async def _mojang_versions() -> dict:
    """Fetch and cache Mojang version manifest."""
    cached = cache_get("mojang_manifest")
    if cached:
        return cached
    data = await fetch_json("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
    if data:
        cache_set("mojang_manifest", data)
    return data or {}


async def provider_vanilla() -> list[dict]:
    manifest = await _mojang_versions()
    if not manifest:
        return []
    results = []
    for v in manifest.get("versions", []):
        if v["type"] == "release":
            results.append({
                "version": v["id"],
                "file": f"server-{v['id']}.jar",
                "download_url": None,  # resolved lazily
                "_meta_url": v["url"],
                "built_at": v.get("releaseTime", ""),
            })
    return results


async def provider_snapshot() -> list[dict]:
    manifest = await _mojang_versions()
    if not manifest:
        return []
    results = []
    for v in manifest.get("versions", []):
        if v["type"] == "snapshot":
            results.append({
                "version": v["id"],
                "file": f"server-{v['id']}.jar",
                "download_url": None,
                "_meta_url": v["url"],
                "built_at": v.get("releaseTime", ""),
            })
    return results


async def resolve_mojang_download(meta_url: str) -> str | None:
    """Get actual server.jar download URL from version meta."""
    data = await fetch_json(meta_url)
    if data and "downloads" in data and "server" in data["downloads"]:
        return data["downloads"]["server"]["url"]
    return None


# ─── PaperMC family (Paper, Velocity, Waterfall, Folia) ──────────────────────

async def _papermc_provider(project: str) -> list[dict]:
    cached = cache_get(f"papermc_{project}")
    if cached:
        return cached

    base = f"https://api.papermc.io/v2/projects/{project}"
    project_data = await fetch_json(base)
    if not project_data:
        return []

    versions = project_data.get("versions", [])
    results = []

    # Fetch builds for recent versions (last 30 to avoid hammering API)
    tasks = []
    for ver in versions[-30:]:
        tasks.append(fetch_json(f"{base}/versions/{ver}/builds"))

    builds_list = await asyncio.gather(*tasks)

    for ver, builds_data in zip(versions[-30:], builds_list):
        if not builds_data or "builds" not in builds_data:
            continue
        for build in reversed(builds_data["builds"]):
            downloads = build.get("downloads", {})
            app_dl = downloads.get("application", {})
            if not app_dl:
                continue
            filename = app_dl.get("name", f"{project}-{ver}-{build['build']}.jar")
            sha256 = app_dl.get("sha256", "")
            results.append({
                "version": ver,
                "build": build["build"],
                "file": filename,
                "sha256": sha256,
                "download_url": f"{base}/versions/{ver}/builds/{build['build']}/downloads/{filename}",
                "built_at": build.get("time", ""),
                "channel": build.get("channel", "default"),
            })
            break  # only latest build per version

    results.reverse()
    cache_set(f"papermc_{project}", results)
    return results


async def provider_paper():
    return await _papermc_provider("paper")

async def provider_folia():
    return await _papermc_provider("folia")

async def provider_velocity():
    return await _papermc_provider("velocity")

async def provider_waterfall():
    return await _papermc_provider("waterfall")


# ─── Purpur ───────────────────────────────────────────────────────────────────

async def provider_purpur() -> list[dict]:
    cached = cache_get("purpur")
    if cached:
        return cached

    base = "https://api.purpurmc.org/v2/purpur"
    project = await fetch_json(base)
    if not project:
        return []

    versions = project.get("versions", [])
    results = []

    # Fetch all version data in parallel
    target_versions = versions[-30:]
    tasks = [fetch_json(f"{base}/{ver}") for ver in target_versions]
    version_data_list = await asyncio.gather(*tasks)

    for ver, ver_data in zip(target_versions, version_data_list):
        if not ver_data:
            continue
        builds = ver_data.get("builds", {})
        latest = builds.get("latest")
        if not latest:
            continue
        results.append({
            "version": ver,
            "build": latest,
            "file": f"purpur-{ver}-{latest}.jar",
            "download_url": f"{base}/{ver}/{latest}/download",
            "built_at": "",
        })

    results.reverse()
    cache_set("purpur", results)
    return results


# ─── Fabric ───────────────────────────────────────────────────────────────────

async def provider_fabric() -> list[dict]:
    cached = cache_get("fabric")
    if cached:
        return cached

    # Get game versions
    game_versions = await fetch_json("https://meta.fabricmc.net/v2/versions/game")
    loader_versions = await fetch_json("https://meta.fabricmc.net/v2/versions/loader")
    installer_versions = await fetch_json("https://meta.fabricmc.net/v2/versions/installer")

    if not game_versions or not loader_versions or not installer_versions:
        return []

    latest_loader = loader_versions[0]["version"]
    latest_installer = installer_versions[0]["version"]

    results = []
    for gv in game_versions:
        if not gv.get("stable", False):
            continue
        ver = gv["version"]
        results.append({
            "version": ver,
            "file": f"fabric-server-mc.{ver}-loader.{latest_loader}-launcher.{latest_installer}.jar",
            "download_url": f"https://meta.fabricmc.net/v2/versions/loader/{ver}/{latest_loader}/{latest_installer}/server/jar",
            "loader_version": latest_loader,
            "installer_version": latest_installer,
            "built_at": "",
        })

    cache_set("fabric", results)
    return results


# ─── Forge ────────────────────────────────────────────────────────────────────

async def provider_forge() -> list[dict]:
    cached = cache_get("forge")
    if cached:
        return cached

    # Use Forge promotions API
    promos = await fetch_json("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json")
    if not promos:
        return []

    versions_map = {}
    for key, forge_ver in promos.get("promos", {}).items():
        parts = key.rsplit("-", 1)
        if len(parts) != 2:
            continue
        mc_ver, channel = parts
        if mc_ver not in versions_map:
            versions_map[mc_ver] = {}
        versions_map[mc_ver][channel] = forge_ver

    results = []
    for mc_ver in sorted(versions_map.keys(), key=lambda v: [int(x) if x.isdigit() else 0 for x in v.split(".")], reverse=True):
        forge_ver = versions_map[mc_ver].get("recommended") or versions_map[mc_ver].get("latest")
        if not forge_ver:
            continue
        full_ver = f"{mc_ver}-{forge_ver}"
        results.append({
            "version": mc_ver,
            "forge_version": forge_ver,
            "file": f"forge-{full_ver}-installer.jar",
            "download_url": f"https://maven.minecraftforge.net/net/minecraftforge/forge/{full_ver}/forge-{full_ver}-installer.jar",
            "channel": "recommended" if "recommended" in versions_map[mc_ver] else "latest",
            "built_at": "",
        })

    cache_set("forge", results)
    return results


# ─── NeoForge ─────────────────────────────────────────────────────────────────

async def provider_neoforge() -> list[dict]:
    cached = cache_get("neoforge")
    if cached:
        return cached

    data = await fetch_json("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge")
    if not data:
        return []

    versions_raw = data.get("versions", [])
    # Group by MC version
    # NeoForge version format: MCMAJOR.MCMINOR.PATCH
    # e.g., 21.1.77 -> MC 1.21.1, 20.4.237 -> MC 1.20.4
    mc_map = {}
    for v in versions_raw:
        parts = v.split(".")
        if len(parts) < 2:
            continue
        try:
            mc_major = int(parts[0])
            mc_minor = int(parts[1])
        except ValueError:
            continue
        mc_ver = f"1.{mc_major}.{mc_minor}" if mc_minor != 0 else f"1.{mc_major}"
        if mc_ver not in mc_map:
            mc_map[mc_ver] = []
        mc_map[mc_ver].append(v)

    results = []
    for mc_ver, forge_versions in mc_map.items():
        latest = forge_versions[-1]
        results.append({
            "version": mc_ver,
            "neoforge_version": latest,
            "file": f"neoforge-{latest}-installer.jar",
            "download_url": f"https://maven.neoforged.net/releases/net/neoforged/neoforge/{latest}/neoforge-{latest}-installer.jar",
            "built_at": "",
        })

    results.reverse()
    cache_set("neoforge", results)
    return results


# ─── Mohist ───────────────────────────────────────────────────────────────────

async def provider_mohist() -> list[dict]:
    cached = cache_get("mohist")
    if cached:
        return cached

    project = await fetch_json("https://mohistmc.com/api/v2/projects/mohist")
    if not project:
        return []

    target_versions = project.get("versions", [])[-15:]
    tasks = [
        fetch_json(f"https://mohistmc.com/api/v2/projects/mohist/{ver}/builds")
        for ver in target_versions
    ]
    builds_list = await asyncio.gather(*tasks)

    results = []
    for ver, builds in zip(target_versions, builds_list):
        if not builds:
            continue
        for build in reversed(builds):
            results.append({
                "version": ver,
                "build": build.get("number", ""),
                "file": build.get("fileName", f"mohist-{ver}.jar"),
                "md5": build.get("fileMd5", ""),
                "download_url": build.get("url", ""),
                "built_at": build.get("createdAt", ""),
            })
            break  # latest only

    results.reverse()
    cache_set("mohist", results)
    return results


# ─── Spigot (via GetBukkit mirror info) ───────────────────────────────────────

async def provider_spigot() -> list[dict]:
    cached = cache_get("spigot")
    if cached:
        return cached

    # Scrape version list from hub.spigotmc.org/versions/
    html = await fetch_text("https://hub.spigotmc.org/versions/")

    mc_versions = []
    if html:
        version_pattern = re.compile(r'href="(\d+\.\d+(?:\.\d+)?)\.json"')
        mc_versions = version_pattern.findall(html)
        mc_versions.sort(
            key=lambda v: [int(x) for x in v.split(".")],
            reverse=True,
        )

    if not mc_versions:
        # Fallback if scraping fails
        mc_versions = [
            "1.21.4", "1.21.3", "1.21.2", "1.21.1", "1.21",
            "1.20.6", "1.20.4", "1.20.2", "1.20.1", "1.20",
            "1.19.4", "1.19.3", "1.19.2", "1.19.1", "1.19",
            "1.18.2", "1.18.1", "1.18",
            "1.17.1", "1.17",
            "1.16.5", "1.16.4", "1.16.3", "1.16.2", "1.16.1",
        ]

    buildtools_url = "https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar"

    results = []
    for ver in mc_versions:
        results.append({
            "version": ver,
            "file": f"spigot-{ver}.jar",
            "download_url": buildtools_url,
            "note": f"Spigot requires BuildTools to compile. Run: java -jar BuildTools.jar --rev {ver}",
            "built_at": "",
        })

    cache_set("spigot", results)
    return results


# ─── BungeeCord ───────────────────────────────────────────────────────────────

async def provider_bungeecord() -> list[dict]:
    cached = cache_get("bungeecord")
    if cached:
        return cached

    # Fetch recent builds from Jenkins API
    data = await fetch_json(
        "https://ci.md-5.net/job/BungeeCord/api/json"
        "?tree=builds[number,timestamp,result]{0,20}"
    )

    results = []
    if data and "builds" in data:
        for build in data["builds"]:
            if build.get("result") != "SUCCESS":
                continue
            build_num = build.get("number", "")
            timestamp = build.get("timestamp", 0)
            built_at = ""
            if timestamp:
                built_at = datetime.fromtimestamp(
                    timestamp / 1000, tz=timezone.utc
                ).isoformat()

            dl_url = f"https://ci.md-5.net/job/BungeeCord/{build_num}/artifact/bootstrap/target/BungeeCord.jar"

            results.append({
                "version": f"build-{build_num}",
                "build": build_num,
                "file": "BungeeCord.jar",
                "download_url": dl_url,
                "built_at": built_at,
            })

    if not results:
        # Fallback to single latest entry
        results = [{
            "version": "latest",
            "file": "BungeeCord.jar",
            "download_url": "https://ci.md-5.net/job/BungeeCord/lastSuccessfulBuild/artifact/bootstrap/target/BungeeCord.jar",
            "built_at": "",
        }]

    cache_set("bungeecord", results)
    return results


# ─── Pufferfish ───────────────────────────────────────────────────────────────

async def provider_pufferfish() -> list[dict]:
    cached = cache_get("pufferfish")
    if cached:
        return cached

    # Pufferfish uses GitHub releases
    data = await fetch_json(
        "https://api.github.com/repos/pufferfish-gg/Pufferfish/releases",
        headers=_github_headers()
    )
    if not data:
        return []

    results = []
    for release in data[:20]:
        tag = release.get("tag_name", "")
        for asset in release.get("assets", []):
            if asset["name"].endswith(".jar"):
                results.append({
                    "version": tag,
                    "file": asset["name"],
                    "size": asset.get("size", 0),
                    "download_url": asset["browser_download_url"],
                    "built_at": release.get("published_at", ""),
                })
                break

    cache_set("pufferfish", results)
    return results


# ─── Leaves ───────────────────────────────────────────────────────────────────

async def provider_leaves() -> list[dict]:
    cached = cache_get("leaves")
    if cached:
        return cached

    data = await fetch_json(
        "https://api.github.com/repos/LeavesMC/Leaves/releases",
        headers=_github_headers()
    )
    if not data:
        return []

    results = []
    for release in data[:20]:
        tag = release.get("tag_name", "")
        for asset in release.get("assets", []):
            if asset["name"].endswith(".jar"):
                results.append({
                    "version": tag,
                    "file": asset["name"],
                    "size": asset.get("size", 0),
                    "download_url": asset["browser_download_url"],
                    "built_at": release.get("published_at", ""),
                })
                break

    cache_set("leaves", results)
    return results


# ─── Sponge ──────────────────────────────────────────────────────────────────

async def provider_sponge() -> list[dict]:
    cached = cache_get("sponge")
    if cached:
        return cached

    results = []

    # Try the Sponge downloads API
    sv_data = await fetch_json("https://dl-api-new.spongepowered.org/api/v2/groups/org.spongepowered/artifacts/spongevanilla")

    if not sv_data or not isinstance(sv_data, dict) or "versions" not in sv_data:
        # Fallback to legacy endpoint
        sv_data = await fetch_json("https://dl-api.spongepowered.org/v2/groups/org.spongepowered/artifacts/spongevanilla")

    if sv_data and isinstance(sv_data, dict) and "versions" in sv_data:
        versions_dict = sv_data["versions"]
        if isinstance(versions_dict, dict):
            for ver_key in list(versions_dict.keys())[:20]:
                ver_info = versions_dict[ver_key]
                download_url = ""
                filename = f"spongevanilla-{ver_key}.jar"

                # Try to extract download URL from version assets
                if isinstance(ver_info, dict):
                    assets = ver_info.get("assets", [])
                    if isinstance(assets, list):
                        for asset in assets:
                            dl = asset.get("downloadUrl", "") or asset.get("url", "")
                            if dl:
                                download_url = dl
                                filename = asset.get("name", filename)
                                break

                if not download_url:
                    # Construct from Maven coordinates as fallback
                    download_url = (
                        f"https://repo.spongepowered.org/repository/maven-releases/"
                        f"org/spongepowered/spongevanilla/{ver_key}/"
                        f"spongevanilla-{ver_key}-universal.jar"
                    )

                results.append({
                    "version": ver_key,
                    "file": filename,
                    "download_url": download_url,
                    "built_at": "",
                })

    cache_set("sponge", results)
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# REGISTRY — categories and types
# ═══════════════════════════════════════════════════════════════════════════════

CATEGORIES = {
    "vanilla": {
        "vanilla": {"provider": provider_vanilla, "description": "Official Minecraft server", "homepage": "https://www.minecraft.net"},
        "snapshot": {"provider": provider_snapshot, "description": "Minecraft snapshot builds", "homepage": "https://www.minecraft.net"},
    },
    "servers": {
        "paper": {"provider": provider_paper, "description": "High-performance Spigot fork", "homepage": "https://papermc.io"},
        "purpur": {"provider": provider_purpur, "description": "Paper fork with extra features", "homepage": "https://purpurmc.org"},
        "spigot": {"provider": provider_spigot, "description": "Modified Minecraft server (requires BuildTools)", "homepage": "https://spigotmc.org"},
        "folia": {"provider": provider_folia, "description": "Paper fork for multi-threaded regions", "homepage": "https://papermc.io/folia"},
        "pufferfish": {"provider": provider_pufferfish, "description": "High-performance Paper fork", "homepage": "https://pufferfish.host"},
        "leaves": {"provider": provider_leaves, "description": "Paper fork with extra gameplay features", "homepage": "https://leavesmc.org"},
        "sponge": {"provider": provider_sponge, "description": "Plugin API with Forge mod compatibility", "homepage": "https://spongepowered.org"},
    },
    "modded": {
        "fabric": {"provider": provider_fabric, "description": "Lightweight modding toolchain", "homepage": "https://fabricmc.net"},
        "forge": {"provider": provider_forge, "description": "Minecraft Forge modding platform", "homepage": "https://minecraftforge.net"},
        "neoforge": {"provider": provider_neoforge, "description": "Community fork of Forge", "homepage": "https://neoforged.net"},
        "mohist": {"provider": provider_mohist, "description": "Forge + Bukkit hybrid server", "homepage": "https://mohistmc.com"},
    },
    "proxies": {
        "velocity": {"provider": provider_velocity, "description": "Modern, high-performance proxy", "homepage": "https://papermc.io/velocity"},
        "waterfall": {"provider": provider_waterfall, "description": "BungeeCord fork by PaperMC", "homepage": "https://papermc.io/waterfall"},
        "bungeecord": {"provider": provider_bungeecord, "description": "Original Minecraft proxy", "homepage": "https://www.spigotmc.org/wiki/bungeecord/"},
    },
}

# Flat lookup: type_name -> (category, provider_info)
TYPE_LOOKUP: dict[str, tuple[str, dict]] = {}
for cat, types in CATEGORIES.items():
    for type_name, info in types.items():
        TYPE_LOOKUP[type_name] = (cat, info)


# ═══════════════════════════════════════════════════════════════════════════════
# API ROUTES (compatible with serverjars.com)
# ═══════════════════════════════════════════════════════════════════════════════

def api_response(data, status="success"):
    return JSONResponse({
        "status": status,
        "response": data,
    })


def api_error(message: str, code: int = 404):
    return JSONResponse(
        {"status": "error", "response": {"message": message}},
        status_code=code,
    )


@app.get("/api/fetchTypes")
async def fetch_types():
    """List all categories and their jar types."""
    result = {}
    for cat, types in CATEGORIES.items():
        result[cat] = list(types.keys())
    return api_response(result)


@app.get("/api/fetchTypes/{category}")
async def fetch_types_by_category(category: str):
    """List jar types in a category."""
    if category not in CATEGORIES:
        return api_error(f"Category '{category}' not found")
    
    result = []
    for type_name, info in CATEGORIES[category].items():
        result.append({
            "name": type_name,
            "description": info.get("description", ""),
            "homepage": info.get("homepage", ""),
            "category": category,
        })
    return api_response(result)


@app.get("/api/fetchAll/{jar_type}")
async def fetch_all(jar_type: str, max: int = Query(default=0, ge=0)):
    """Fetch all versions for a jar type."""
    if jar_type not in TYPE_LOOKUP:
        return api_error(f"Type '{jar_type}' not found")

    cat, info = TYPE_LOOKUP[jar_type]
    provider = info["provider"]
    results = await provider()

    if max > 0:
        results = results[:max]

    return api_response(results)


@app.get("/api/fetchLatest/{jar_type}")
async def fetch_latest(jar_type: str):
    """Fetch the latest version for a jar type."""
    if jar_type not in TYPE_LOOKUP:
        return api_error(f"Type '{jar_type}' not found")

    cat, info = TYPE_LOOKUP[jar_type]
    provider = info["provider"]
    results = await provider()

    if not results:
        return api_error("No versions available")

    return api_response(results[0])


@app.get("/api/fetchJar/{jar_type}")
@app.get("/api/fetchJar/{jar_type}/{version}")
async def fetch_jar(jar_type: str, version: str = "latest"):
    """Redirect to jar download URL."""
    if jar_type not in TYPE_LOOKUP:
        return api_error(f"Type '{jar_type}' not found")

    cat, info = TYPE_LOOKUP[jar_type]
    provider = info["provider"]
    results = await provider()

    if not results:
        return api_error("No versions available")

    target = None
    if version == "latest":
        target = results[0]
    else:
        for r in results:
            if r.get("version") == version:
                target = r
                break

    if not target:
        return api_error(f"Version '{version}' not found for '{jar_type}'")

    download_url = target.get("download_url")

    # Resolve Mojang lazy URLs
    if download_url is None and "_meta_url" in target:
        download_url = await resolve_mojang_download(target["_meta_url"])

    if not download_url:
        return api_error("Download URL not available")

    return RedirectResponse(download_url, status_code=302)


# ─── Extra endpoints ─────────────────────────────────────────────────────────

@app.get("/api/typeInfo/{jar_type}")
async def type_info(jar_type: str):
    """Get metadata about a jar type."""
    if jar_type not in TYPE_LOOKUP:
        return api_error(f"Type '{jar_type}' not found")
    cat, info = TYPE_LOOKUP[jar_type]
    return api_response({
        "name": jar_type,
        "category": cat,
        "description": info.get("description", ""),
        "homepage": info.get("homepage", ""),
    })


@app.get("/api/stats")
async def stats():
    """API statistics."""
    total_types = sum(len(types) for types in CATEGORIES.values())
    return api_response({
        "categories": len(CATEGORIES),
        "types": total_types,
        "cache_entries": len(_cache),
        "cache_ttl_seconds": CACHE_TTL,
    })


@app.get("/api/fetchAll_summary")
async def fetch_all_summary():
    """Return all types with their info and latest version in one call."""
    result = {}
    for cat, types in CATEGORIES.items():
        result[cat] = {}
        for type_name, info in types.items():
            provider = info["provider"]
            versions = await provider()
            latest = versions[0] if versions else None
            result[cat][type_name] = {
                "description": info.get("description", ""),
                "homepage": info.get("homepage", ""),
                "latest": latest,
            }
    return api_response(result)


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


# ─── Web UI ───────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index():
    html_path = Path(__file__).parent.parent / "templates" / "index.html"
    return HTMLResponse(html_path.read_text())


