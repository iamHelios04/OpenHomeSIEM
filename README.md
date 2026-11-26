# OpenHomeSIEM

## What is this

OpenHomeSIEM is a self-hosted syslog collector and investigation console designed for a home lab today and additional network devices over time. The first profile targets a D-Link DSL-8251CG1 router. A FastAPI service stores normalized RFC 3164/RFC 5424 events in SQLite, listens for UDP/514 and TCP/601 inside its container, discovers DHCP clients, runs local anomaly rules, and broadcasts updates over WebSocket. A React console provides dashboards, search, device inventory, investigations, analyst alerts, and reports.

GitHub distributes application source and container images only. Each person runs a separate collector; syslog goes directly from their router to their own collector and stays in that installation's local `data/` directory and SQLite database. Syslog and database contents are never sent to GitHub.

GitHub Actions builds both containers and checks the API health endpoint on pushes and pull requests. Pushing a `v*` version tag builds and publishes `linux/amd64` and `linux/arm64` images to GitHub Container Registry (GHCR).

## Architecture diagram (ASCII)

```text
D-Link router / future syslog sources
         | UDP 5514 or optional TCP 6601
         v
+-------------------------+       HTTP /api + WebSocket /ws/logs
| FastAPI collector       | <----------------------------------+
| parser -> tracker -> DB |                                    |
| anomaly + retention     |                                    v
+------------+------------+                         +------------------+
             |                                      | React / Vite UI  |
             v                                      | dashboard/SOC   |
      SQLite (dev)                                   +------------------+
      PostgreSQL-ready URL
```

## Install on another computer

OpenHomeSIEM runs on Windows, macOS, and Linux through Docker Compose. A fresh installation generates a private `.env` with a random secret key, creates an empty local SQLite database under `data/`, pulls the published containers, starts them, and checks API/dashboard health. No Python, Node.js, PostgreSQL, or separate database setup is required.

1. Install and start [Docker Desktop](https://www.docker.com/products/docker-desktop/) on Windows or macOS. On Ubuntu, install [Docker Engine and the Compose plugin](https://docs.docker.com/engine/install/ubuntu/).
2. Clone the repository (or download and extract its ZIP) onto the computer that will collect logs:

   ```sh
   git clone https://github.com/iamHelios04/OpenHomeSIEM.git
   cd OpenHomeSIEM
   ```

3. Start it:

   - **Windows:** double-click `install.cmd`, or run `.\install.ps1` from PowerShell.
   - **macOS:** run `sh ./install.sh` in Terminal.
   - **Ubuntu/Linux:** run `sh ./install.sh` (use `sudo` on Ubuntu Server).

The default dashboard address is `http://localhost:8080`. To use the app later, double-click `start.cmd` / `stop.cmd` on Windows or run `sh ./start.sh` / `sh ./stop.sh` on macOS and Linux. Stopping the app preserves its settings and database. To update to the latest published images, run `docker compose pull` and `docker compose up -d` from the project directory.

Each computer keeps its settings in `.env` and its database in `data/siem.db`; both remain local and are ignored by Git. Never commit or upload `.env`, `data/`, backups, or logs. A fresh clone starts with a new database. To move an existing installation, stop the app and copy its `.env` and `data/` directory to the new installation folder before starting it.

The published containers are the default runtime. For an optional source build, run `sh ./install.sh --source-build` on macOS/Linux, `.\install.ps1 -SourceBuild` in PowerShell, or `install.cmd -SourceBuild` on Windows. This setting is saved in `.env`; subsequent starts use the source-build Compose overlay. To switch back to published images, set `BUILD_FROM_SOURCE=false` in `.env`.

To publish images for a new release, push a version tag such as `v1.0.1`. After the first release, set both `openhome-siem-backend` and `openhome-siem-frontend` package visibility to **Public** in GitHub Packages so installations can pull them without credentials. Choose the desired version in a local `.env` with `IMAGE_TAG=1.0.1`; `latest` is used by default.

## License

No license is granted. All rights are reserved; public visibility of this repository does not grant permission to reuse, modify, or distribute the source.

## Ubuntu Server

On the server, install Docker Engine and its Compose plugin, then run:

```sh
git clone https://github.com/iamHelios04/OpenHomeSIEM.git
cd OpenHomeSIEM
sudo sh ./install.sh
sudo docker compose ps
```

The dashboard is bound to the server's localhost only. From your laptop, create an SSH tunnel:

```sh
ssh -L 8080:127.0.0.1:8080 USER@COLLECTOR_SERVER
```

Then open `http://localhost:8080` on the laptop.

### Connect a router

The collector uses these host ports by default: dashboard TCP/8080, syslog UDP/5514, and optional syslog TCP/6601. The dashboard binds to localhost by default; the API and WebSocket are proxied internally. Docker translates syslog to its internal UDP/514 and TCP/601 listeners.

RFC 3164 syslog messages do not carry a timezone. Fresh installs default to `SYSLOG_TIMEZONE=Asia/Kolkata`; if the router uses another timezone, edit that value in `.env` to match the router and restart the app.

1. Find the collector computer's **LAN or VPN IP address**. For example, use `ipconfig` on Windows or `ip addr` on Linux.
2. In the router's remote logging/syslog settings, enable remote syslog and set the destination to that IP and **UDP port 5514** by default. Use TCP/6601 only if the router supports TCP syslog.
3. Allow inbound UDP/5514 through the collector computer's firewall only from the trusted home/VPN network. Allow TCP/6601 only if using TCP.
4. Open `http://localhost:8080`, choose **View live events**, and confirm incoming records appear.

Do not port-forward your home router to the internet. On a public server, keep the dashboard private and reachable only through a VPN or SSH tunnel. Prefer a VPN for syslog; otherwise restrict UDP/5514 ingress to your home public IP using the cloud firewall/security group. Public UDP syslog is unencrypted and can be observed or spoofed in transit. Docker-published ports may bypass UFW rules; do not rely on `ufw allow` or UFW alone to protect published container ports. Apply source restrictions in the cloud firewall before traffic reaches the host, or configure and test Docker-aware filtering (for example, Docker's `DOCKER-USER` chain) using the [Docker firewall documentation](https://docs.docker.com/engine/network/packet-filtering-firewalls/). If a port is already in use, edit the matching value in `.env` and restart with `start.cmd` or `sh ./start.sh`.

## Developer setup without Docker

### Backend setup (Python venv, pip install, run uvicorn)

Use Python 3.11 or newer. In PowerShell:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item ..\.env.example ..\.env
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The default database is `backend/data/siem.db`. To listen on privileged ports on Windows, run the terminal with the required permissions or set the syslog listener to unprivileged ports and use port forwarding. The API can run without syslog listeners by setting `ENABLE_SYSLOG_LISTENER=false`.

Schema changes are versioned under `backend/migrations/` and applied with Alembic at startup while `AUTO_MIGRATE=true`. For a controlled deployment, set it to `false` and run `alembic upgrade head` from the `backend/` directory as a deployment step before starting the API.

### Frontend setup (npm install, npm run dev)

In another terminal:

```powershell
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

Vite serves the console on `http://localhost:5173` and proxies `/api` and `/ws` to the backend. Set `VITE_API_BASE_URL` or `VITE_WS_URL` only when the services are hosted separately.

## How to add a new device in future

Set `source_device` when posting logs to `/api/ingest`; syslog packets are identified by sender IP. Add a parser in `backend/services/parsers/` that implements `parse(raw_line) -> ParsedLog`, register its device type in the parser registry, then add detection or device-tracking behavior if that source has useful fields. Keep the normalized `LogRecord` schema stable so new sources share the same filters, charts, and reports.

## How to enable AI features in future

`backend/services/ai_service.py` defines asynchronous interfaces for anomaly summaries, log classification, and natural-language search. The default implementation is deliberately offline and returns a clear disabled result. To add a provider, configure its credentials through environment variables, implement a provider class behind those interfaces, and add request limits, redaction, timeouts, and audit logging before sending home-network data externally. The schema has `embedding`, `ai_summary`, and `ai_tags` fields ready for later migrations.

## Environment variables reference

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/siem.db` | Async SQLAlchemy database URL; PostgreSQL can be used with an async driver. |
| `GHCR_OWNER` | `iamhelios04` | GitHub account or organization that owns the published container images. |
| `IMAGE_TAG` | `latest` | Published container image version to install. |
| `BUILD_FROM_SOURCE` | `false` | Use the local source-build Compose overlay instead of pulling GHCR images. |
| `AUTO_MIGRATE` | `true` | Apply Alembic revisions on startup; disable when migrations are run as a separate deployment step. |
| `SYSLOG_UDP_HOST` | `0.0.0.0` | UDP listener bind address. |
| `SYSLOG_UDP_PORT` | `5514` | Host UDP port published for the router; Docker forwards it to the collector's internal UDP/514 listener. |
| `SYSLOG_TCP_HOST` | `0.0.0.0` | TCP listener bind address. |
| `SYSLOG_TCP_PORT` | `6601` | Host TCP port published for senders; Docker forwards it to the collector's internal TCP/601 listener. |
| `SYSLOG_TIMEZONE` | `Asia/Kolkata` | Time zone used to interpret RFC 3164 timestamps, which do not include an offset. Set it to the sender's time zone. |
| `ENABLE_SYSLOG_LISTENER` | `true` | Enable UDP and TCP listeners. |
| `WEB_PORT` | `8080` | Host port for the dashboard. |
| `WEB_BIND_IP` | `127.0.0.1` | Host address for the dashboard. Keep localhost binding on public servers; use `0.0.0.0` only when the LAN firewall is configured to restrict access. |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost` | Comma-separated browser origins. |
| `LOG_LEVEL` | `INFO` | Python logging level. |
| `SECRET_KEY` | randomly generated on first install | Private application key stored only in the local `.env`. |
| `MAX_RECORDS_PER_QUERY` | `10000` | Upper bound for API page size. |
| `MAX_INGEST_LINES` | `10000` | Maximum lines accepted per HTTP ingest request. |
| `SUSPICIOUS_IPS` | empty | Optional comma-separated local IP indicators; no external reputation lookup is used. |
| `MAX_LOG_RETENTION_DAYS` | `90` | Retention period before archive-and-delete. |
| `ARCHIVE_DIR` | `./data/archive` | CSV archive directory for retention jobs. |
| `RETENTION_CHECK_HOURS` | `24` | Interval between retention runs. |
| `SMTP_HOST` / `SMTP_PORT` | unset / `587` | Optional mail transport for future routed alerts. |
| `SMTP_USERNAME` / `SMTP_PASSWORD` / `SMTP_FROM` | unset | Optional SMTP authentication and sender settings. |
| `VITE_API_BASE_URL` | `/api` | Frontend API base URL. |
| `VITE_WS_URL` | inferred from page origin | Optional WebSocket endpoint override. |

## API endpoints reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Service and database health. |
| `GET` | `/api/logs` | Paginated, filterable, sortable log events. |
| `POST` | `/api/ingest` | Parse and store a bounded batch of syslog lines, then queue local anomaly analysis. |
| `GET` | `/api/stats` | Dashboard totals, type counts, and hourly counts. |
| `GET/POST` | `/api/devices` | List or register devices. |
| `GET/PATCH` | `/api/devices/{id}` | Read or update a device, including trusted state and tags. |
| `GET/PATCH` | `/api/anomalies` | List detections or resolve/update notes. |
| `GET/POST` | `/api/alerts` | List or create analyst investigations. |
| `PATCH/DELETE` | `/api/alerts/{id}` | Update status/details or remove an alert. |
| `GET` | `/api/reports/summary` | Aggregated report payload. |
| `GET` | `/api/reports/summary.pdf` | Printable PDF export. |
| `WS` | `/ws/logs` | Stream new logs, anomalies, and devices. |

List endpoints accept `page` and `page_size` and return `items`, `total`, `page`, and `pages`. The log endpoint also accepts `type`, `severity_group`, `source_ip`, `process`, `domain`, `search`, `from_time`, `to_time`, `sort_by`, `sort_dir`, and `source_device`. Ingest returns `anomalies_found: 0` while the background rule worker runs; completed detections are streamed over `/ws/logs`.

## Troubleshooting

- **No syslog events:** Confirm the router's destination IP, UDP port, host firewall rule, and that only one service owns the selected port.
- **A port is already in use:** Set `WEB_PORT`, `SYSLOG_UDP_PORT`, or `SYSLOG_TCP_PORT` in `.env` to another unused port and restart the app. Update the router destination port when changing a syslog port.
- **Frontend cannot reach API:** Check that the backend is healthy and that Vite or Nginx proxies `/api` and `/ws` to the backend service name.
- **SQLite database cannot open:** Ensure the `data/` directory is writable and that `DATABASE_URL` uses `sqlite+aiosqlite`.
- **CORS errors in a split deployment:** Add the exact frontend origin to `CORS_ORIGINS`, including scheme and port.
- **TCP logs do not arrive:** Configure the sender for TCP/601; TCP syslog is newline-delimited.
- **Charts appear empty:** Ingest events with timestamps and DNS query messages, then refresh the dashboard.

This project is intended for a trusted home lab. Put it behind a VPN or authenticated reverse proxy before exposing it beyond the LAN.
