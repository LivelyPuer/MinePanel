<div align="center">

<img src="https://github.com/LivelyPuer/MinePanel/blob/main/frontend/public/logo-title.png?raw=true" width="180" height="180" alt="MinePanel Logo">

# MinePanel

**Панель управления Minecraft серверами + агрегатор JAR-файлов из официальных источников**

[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/livelypuer/minepanel)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://python.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)

[Возможности](#-возможности) · [Быстрый старт](#-быстрый-старт) · [Конфигурация](#-конфигурация) · [API](#-api) · [Архитектура](#-архитектура)

</div>

---

## ✨ Возможности

🖥️ **Управление серверами** — создание, запуск, остановка через веб-интерфейс

💬 **Консоль реального времени** — WebSocket-подключение к консоли сервера

📁 **Файловый менеджер** — редактирование конфигураций прямо из браузера

📊 **Аналитика ресурсов** — CPU, RAM, диск (система + каждый сервер отдельно)

📈 **Графики нагрузки** — историческая статистика за 1ч / 6ч / 24ч

🧩 **Агрегатор JAR-файлов** — встроенная замена serverjars.com, 16 типов из 4 категорий

---

## 🎮 Поддерживаемые серверы

| Категория | Типы |
|:---------:|------|
| 🟢 **Vanilla** | `vanilla` · `snapshot` |
| ⚡ **Servers** | `paper` · `purpur` · `spigot` · `folia` · `pufferfish` · `leaves` · `sponge` |
| 🔧 **Modded** | `fabric` · `forge` · `neoforge` · `mohist` |
| 🌐 **Proxies** | `velocity` · `waterfall` · `bungeecord` |

---

## 🚀 Быстрый старт

### Docker Compose (рекомендуется)

Создайте `docker-compose.yml`:

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

```bash
# Запуск
docker compose up -d

# Остановка
docker compose down

# Обновление
docker compose pull && docker compose up -d
```

> 💡 **GitHub Token (опционально):** для обхода rate limits создайте `.env` рядом с `docker-compose.yml`:
> ```
> GITHUB_TOKEN=ghp_your_token_here
> ```

### После запуска

| Сервис | URL |
|:------:|:---:|
| 🖥️ Панель управления | [`http://localhost:8585`](http://localhost:8585) |
| 📦 ServerJars API | [`http://localhost:8580`](http://localhost:8580) |

---

<details>
<summary>📦 <b>Ручной запуск через Docker (без Compose)</b></summary>

<br>

**1. Сеть и тома:**

```bash
docker network create minepanel
docker volume create serverjars_cache
docker volume create panel_data
```

**2. ServerJars API:**

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

**3. MinePanel:**

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

**Остановка / удаление / обновление:**

```bash
docker stop minepanel serverjars && docker rm minepanel serverjars

# Обновление — pull + повторный запуск
docker pull livelypuer/minepanel:latest
docker pull livelypuer/serverjars:latest
```

</details>

---

## ⚙️ Конфигурация

### Panel

| Переменная | По умолчанию | Описание |
|:----------:|:------------:|----------|
| `SERVERJARS_URL` | `http://serverjars:8080` | URL ServerJars API |
| `DATA_DIR` | `/data` | Директория данных |
| `JAVA_PATH` | `java` | Путь к Java |
| `MC_PORT_MIN` | `25565` | Минимальный порт MC |
| `MC_PORT_MAX` | `25600` | Максимальный порт MC |

### ServerJars API

| Переменная | По умолчанию | Описание |
|:----------:|:------------:|----------|
| `CACHE_TTL` | `3600` | Время жизни кеша (сек) |
| `GITHUB_TOKEN` | — | GitHub токен для rate limits |

---

## 📡 API

### ServerJars API

Полностью совместим с форматом serverjars.com.

```
GET  /api/fetchTypes                  — все категории и типы
GET  /api/fetchAll/{type}             — все версии типа
GET  /api/fetchLatest/{type}          — последняя версия
GET  /api/fetchJar/{type}/{version}   — скачать JAR (302 redirect)
GET  /api/typeInfo/{type}             — информация о типе
GET  /api/stats                       — статистика API
```

### Panel API

```
GET    /api/servers                   — список серверов
POST   /api/servers                   — создать сервер
POST   /api/servers/:id/start        — запустить
POST   /api/servers/:id/stop         — остановить
GET    /api/analytics/system          — метрики системы
GET    /api/analytics/servers         — метрики серверов
GET    /api/analytics/history         — история нагрузки
WS     /ws/console/:id               — консоль (WebSocket)
```

---

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────┐
│                  Docker Host                 │
│                                             │
│  ┌──────────────┐    ┌──────────────────┐   │
│  │  ServerJars   │◄───│    MinePanel      │   │
│  │   :8580       │    │     :8585         │   │
│  │               │    │                   │   │
│  │  JAR агрегатор│    │  FastAPI + React  │   │
│  └──────────────┘    │  SQLite + psutil  │   │
│                       │                   │   │
│                       │  ┌─────────────┐  │   │
│                       │  │ MC Servers   │  │   │
│                       │  │ :25565-25600 │  │   │
│                       │  └─────────────┘  │   │
│                       └──────────────────┘   │
└─────────────────────────────────────────────┘
```

### Стек технологий

| Слой | Технологии |
|:----:|------------|
| **Backend** | Python 3.12 · FastAPI · SQLite · psutil |
| **Frontend** | React 19 · Vite · Recharts |
| **Runtime** | OpenJDK 21 |
| **Infra** | Docker · Docker Compose |

---

## 📥 Источники данных

Все JAR-файлы загружаются исключительно из официальных источников:

| Источник | Типы серверов |
|----------|--------------|
| **Mojang** | vanilla, snapshot |
| **PaperMC API** | paper, folia, velocity, waterfall |
| **PurpurMC API** | purpur |
| **FabricMC Meta** | fabric |
| **MinecraftForge Maven** | forge |
| **NeoForged Maven** | neoforge |
| **MohistMC API** | mohist |
| **GitHub Releases** | pufferfish, leaves |
| **SpigotMC / md-5 CI** | spigot, bungeecord |
| **SpongePowered** | sponge |

---

## 📄 Лицензия

Распространяется под лицензией [MIT](LICENSE).

---

<div align="center">

**[⬆ Наверх](#minepanel)**

</div>