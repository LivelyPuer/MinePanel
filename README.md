# MinePanel

Панель управления Minecraft серверами + агрегатор JAR-файлов из официальных источников.

## Возможности

- Создание и управление Minecraft серверами через веб-интерфейс
- Консоль сервера в реальном времени (WebSocket)
- Файловый менеджер и редактор конфигураций
- Аналитика ресурсов: CPU, RAM, диск (система + каждый сервер)
- Графики исторической нагрузки (1ч / 6ч / 24ч)
- Встроенный агрегатор JAR-файлов (замена serverjars.com)
- 16 типов серверов из 4 категорий

## Поддерживаемые серверы

| Категория | Типы |
|-----------|------|
| **vanilla** | vanilla, snapshot |
| **servers** | paper, purpur, spigot, folia, pufferfish, leaves, sponge |
| **modded** | fabric, forge, neoforge, mohist |
| **proxies** | velocity, waterfall, bungeecord |

## Быстрый старт

```bash
git clone https://github.com/livelypuer/minepanel.git
cd minepanel
docker compose up -d
```

- **Панель управления:** http://localhost:8585
- **ServerJars API:** http://localhost:8580

## Docker Hub

```bash
docker pull livelypuer/minepanel:latest
docker pull livelypuer/serverjars:latest
```

Или используйте `docker-compose.yml` из репозитория.

## Архитектура

Проект состоит из двух сервисов:

| Сервис | Порт | Описание |
|--------|------|----------|
| **panel** | 8585 | Панель управления (FastAPI + React) |
| **serverjars** | 8580 | API агрегатор JAR-файлов |

### Стек технологий

- **Backend:** Python 3.12, FastAPI, SQLite, psutil
- **Frontend:** React 19, Vite, Recharts
- **Runtime:** OpenJDK 21 (для Minecraft серверов)
- **Инфраструктура:** Docker, Docker Compose

## Конфигурация

### Panel

| Переменная | По умолчанию | Описание |
|------------|-------------|----------|
| `SERVERJARS_URL` | `http://serverjars:8080` | URL ServerJars API |
| `DATA_DIR` | `/data` | Директория данных |
| `JAVA_PATH` | `java` | Путь к Java |
| `MC_PORT_MIN` | `25565` | Минимальный порт MC |
| `MC_PORT_MAX` | `25600` | Максимальный порт MC |

### ServerJars API

| Переменная | По умолчанию | Описание |
|------------|-------------|----------|
| `CACHE_TTL` | `3600` | Время жизни кеша (секунды) |
| `GITHUB_TOKEN` | — | GitHub токен (опционально, для rate limits) |

## ServerJars API

Полностью совместим с форматом serverjars.com:

```
GET /api/fetchTypes                  — все категории и типы
GET /api/fetchAll/{type}             — все версии
GET /api/fetchLatest/{type}          — последняя версия
GET /api/fetchJar/{type}/{version}   — скачать JAR (302 redirect)
GET /api/typeInfo/{type}             — информация о типе
GET /api/stats                       — статистика API
```

## Panel API

```
GET    /api/servers                  — список серверов
POST   /api/servers                  — создать сервер
POST   /api/servers/:id/start       — запустить
POST   /api/servers/:id/stop        — остановить
GET    /api/analytics/system         — метрики системы
GET    /api/analytics/servers        — метрики серверов
GET    /api/analytics/history        — история нагрузки
WS     /ws/console/:id              — консоль (WebSocket)
```

## Источники данных

Все JAR-файлы загружаются из официальных источников:

- **Mojang** — vanilla, snapshot
- **PaperMC API** — paper, folia, velocity, waterfall
- **PurpurMC API** — purpur
- **FabricMC Meta** — fabric
- **MinecraftForge Maven** — forge
- **NeoForged Maven** — neoforge
- **MohistMC API** — mohist
- **GitHub Releases** — pufferfish, leaves
- **SpigotMC / md-5 CI** — spigot, bungeecord
- **SpongePowered** — sponge

## Лицензия

MIT License. См. [LICENSE](LICENSE).
