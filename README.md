<div align="center">
<img src="https://github.com/LivelyPuer/MinePanel/blob/main/frontend/public/logo-title.png?raw=true" width="180" height="180" alt="MinePanel Logo">
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

## Развертывание

### Способ 1: Docker Compose (рекомендуется)

Создайте файл `docker-compose.yml` на сервере и вставьте в него:

```yaml
services:
  serverjars:
    image: livelypuer/serverjars:latest
    container_name: serverjars
    restart: unless-stopped
    ports:
      - "8580:8080"
    volumes:
      - serverjars_cache:/data/cache
    environment:
      - CACHE_TTL=3600
      - GITHUB_TOKEN=${GITHUB_TOKEN:-}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  panel:
    image: livelypuer/minepanel:latest
    container_name: minepanel
    restart: unless-stopped
    ports:
      - "8585:8585"
      - "25565-25600:25565-25600"
    volumes:
      - panel_data:/data
    environment:
      - SERVERJARS_URL=http://serverjars:8080
      - JAVA_PATH=java
      - DATA_DIR=/data
      - MC_PORT_MIN=25565
      - MC_PORT_MAX=25600
    depends_on:
      - serverjars

volumes:
  serverjars_cache:
  panel_data:
```

Запустите:

```bash
docker compose up -d
```

Для остановки:

```bash
docker compose down
```

Для обновления до последней версии:

```bash
docker compose pull
docker compose up -d
```

> **Опционально:** если вам нужен GitHub токен для обхода rate limits при скачивании JAR-файлов, создайте файл `.env` рядом с `docker-compose.yml`:
> ```
> GITHUB_TOKEN=ghp_your_token_here
> ```

---

### Способ 2: Docker (без Compose)

Если вы не используете Docker Compose, контейнеры можно запустить вручную.

**1. Создайте сеть для связи между контейнерами:**

```bash
docker network create minepanel
```

**2. Создайте тома для хранения данных:**

```bash
docker volume create serverjars_cache
docker volume create panel_data
```

**3. Запустите ServerJars API:**

```bash
docker run -d \
  --name serverjars \
  --network minepanel \
  --restart unless-stopped \
  -p 8580:8080 \
  -v serverjars_cache:/data/cache \
  -e CACHE_TTL=3600 \
  livelypuer/serverjars:latest
```

**4. Запустите MinePanel:**

```bash
docker run -d \
  --name minepanel \
  --network minepanel \
  --restart unless-stopped \
  -p 8585:8585 \
  -p 25565-25600:25565-25600 \
  -v panel_data:/data \
  -e SERVERJARS_URL=http://serverjars:8080 \
  -e JAVA_PATH=java \
  -e DATA_DIR=/data \
  -e MC_PORT_MIN=25565 \
  -e MC_PORT_MAX=25600 \
  livelypuer/minepanel:latest
```

Для остановки и удаления:

```bash
docker stop minepanel serverjars
docker rm minepanel serverjars
```

Для обновления:

```bash
docker pull livelypuer/minepanel:latest
docker pull livelypuer/serverjars:latest
docker stop minepanel serverjars
docker rm minepanel serverjars
# Повторите команды запуска из шагов 3 и 4
```

---

### Доступ

После запуска (любым способом):

- **Панель управления:** http://localhost:8585
- **ServerJars API:** http://localhost:8580

### Docker Hub

Образы доступны на Docker Hub:

```bash
docker pull livelypuer/minepanel:latest
docker pull livelypuer/serverjars:latest
```

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
