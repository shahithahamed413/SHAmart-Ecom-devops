# ShaMart Backend

Production-grade Flask + MySQL REST API for the ShaMart storefront. Built with
the Application Factory pattern, a dedicated `database/` package (fully
decoupled from HTTP), SQLAlchemy 2.x ORM, resilient connection pooling and
Prometheus observability for Kubernetes.

The backend and the database layer are **two separate, sibling folders**: the
Flask presentation code lives in `backend/`, while all datastore logic
(engine, pooling, models, seeder) lives in `database/` next to it. The backend
imports its engine / sessions / models exclusively from that `database/`
package at runtime.

## Project layout

```
cloudmart2/
├── backend/                  # Flask backend folder (this project)
│   ├── app/                  # Flask application package
│   │   ├── __init__.py       # create_app(), CORS, blueprint registration
│   │   ├── config.py         # 12-Factor config from environment variables
│   │   ├── routes_api.py     # Storefront endpoints (products, orders)
│   │   └── routes_ops.py     # Probes, version, chaos toggle, /metrics
│   ├── .env.example          # Sample environment file
│   ├── requirements.txt
│   ├── Dockerfile            # Build context = project root (see below)
│   └── run.py                # Server entrypoint
├── database/                 # DEDICATED DATABASE PACKAGE — OUTSIDE backend
│   ├── __init__.py           # Exports engine, SessionLocal, Base, get_db, ...
│   ├── connection.py         # Engine + pooling + session lifecycle (PyMySQL)
│   ├── models.py             # Product and Order ORM models
│   └── seed.py               # Standalone seeder (python -m database.seed)
├── frontend/                 # Vanilla-JS/Vite storefront (localhost:5173)
└── .dockerignore             # Build-context filters (project root)
```

## Requirements

- Python 3.10+ (see note below about Python 3.13+)
- MySQL 5.7+ / 8.x (running and reachable)

> Note: the pinned `SQLAlchemy==2.0.30` is incompatible with Python 3.13+
> (fails at import with a `__firstlineno__` symbol error). On Python 3.13+
> use `SQLAlchemy>=2.0.37`.

## 1. Install dependencies (from the backend folder)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

> `database/` is located one level up; the entrypoints (`backend/run.py` and
> `backend/app/__init__.py`) add the project root to `sys.path` automatically,
> so no extra PYTHONPATH setup is needed for local runs.

## 2. Configure environment

```bash
cd backend
cp .env.example .env             # then edit values as needed
```

See `.env.example` for every supported variable (DB_*, pool tuning, PORT,
APP_ENV, GIT_COMMIT_SHA, IMAGE_TAG, CORS_ORIGINS, ...).

## 3. Create the database user + schema

```sql
CREATE DATABASE IF NOT EXISTS cloudmart_db CHARACTER SET utf8mb4;
CREATE USER IF NOT EXISTS 'cloudmart_user'@'%' IDENTIFIED BY 'secretpass';
GRANT ALL PRIVILEGES ON cloudmart_db.* TO 'cloudmart_user'@'%';
FLUSH PRIVILEGES;
```

Tables are created automatically on boot via `init_db()`.

## 4. Seed inventory

```bash
# From the project root (so the database folder is importable)
python -m database.seed          # inserts catalog only if products is empty
python -m database.seed --reset  # wipe + reseed
```

## 5. Run the app

### Local development

```bash
# From the project root
python backend/run.py            # 0.0.0.0:8000 by default
```

### Production (Gunicorn)

```bash
# From the project root
gunicorn --chdir backend --workers 4 --threads 8 --bind 0.0.0.0:8000 "run:app"
```

## 6. Docker (backend + database as siblings)

Build and start the backend and MySQL together from the project root:

```bash
cp .env.example .env
cp backend/.env.compose.example backend/.env.compose
cp database/.env.example database/.env
# Set strong passwords in both files; DB_PASSWORD and MYSQL_PASSWORD must match.
docker compose -f DockerCompose.yml up --build
```

Compose loads each service's settings from its own ignored env file, keeping
the MySQL root password out of the backend container. Set `DB_HOST=database`
so the backend can reach MySQL over the Compose network. Copying the root
`.env.example` to `.env` configures the host ports (`API_PORT`, `MYSQL_PORT`,
and `FRONTEND_PORT`); edit those values if the default ports are unavailable.
The frontend proxies API requests to the backend. MySQL data is stored in the
named `mysql_data` volume and remains available after the containers stop or
are recreated. Use
`docker compose -f DockerCompose.yml down -v` only when you also want to delete
that persisted data.

### MySQL in its own container (recommended)

The `database/` folder ships its own Dockerfile so MySQL runs as a **separate**
container, decoupled from the backend:

```bash
# Build the DB image (context = the database/ folder itself)
docker build -f database/Dockerfile -t shamart-db database/

# Run MySQL (create database + user on first boot, persist data in a volume)
docker run -d --name shamart-db \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=cloudmart_db \
  -e MYSQL_USER=cloudmart_user \
  -e MYSQL_PASSWORD=secretpass \
  -v shamart-db-data:/var/lib/mysql \
  shamart-db

# Point the backend at the container:
DB_HOST=127.0.0.1 DB_USER=cloudmart_user DB_PASSWORD=secretpass DB_NAME=cloudmart_db python backend/run.py
```

> If host port `3306` is already taken (e.g. a local MySQL service), map a
> different one and tell the backend: `-p 3307:3306` and `DB_PORT=3307`.

- The MySQL image initializes the database and application user from
  `MYSQL_DATABASE`, `MYSQL_USER`, and `MYSQL_PASSWORD` on first boot of an
  empty volume.
- Tables are created automatically by the backend (`init_db()`); load the
  catalog with `python -m database.seed`.
- `shamart-db-data` persists data across container restarts. The `MYSQL_USER/
  MYSQL_PASSWORD` env vars must match `DB_USER/DB_PASSWORD` used by the backend.

## Endpoints

| Method | Path                       | Description                                     |
|--------|----------------------------|-------------------------------------------------|
| GET    | `/healthz`                 | Liveness probe (200 always)                     |
| GET    | `/readyz`                  | Readiness probe (`SELECT 1`, 503 when DB down / chaos) |
| GET    | `/api/v1/version`          | Build/release metadata                          |
| POST   | `/api/v1/chaos/toggle`     | Toggle chaos mode (`{"enabled": true}`)        |
| GET    | `/metrics`                 | Prometheus metrics (text exposition)            |
| GET    | `/api/v1/products`         | List products (`?category=` / `?q=` filters)    |
| GET    | `/api/v1/products/<id>`    | Product detail (404 if missing)                 |
| POST   | `/api/v1/orders`           | Create order with stock decrement               |

### Create an order

```bash
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "Ada Lovelace",
    "customer_email": "ada@example.com",
    "shipping_address": "1 Analytical Engine Row, London",
    "total_amount": 45.98,
    "items": [{"product_id": 1, "quantity": 2}]
  }'
```

### Test chaos / failover

```bash
curl -X POST http://localhost:8000/api/v1/chaos/toggle -d '{"enabled": true}'
curl http://localhost:8000/readyz   # -> 503 degraded
curl -X POST http://localhost:8000/api/v1/chaos/toggle -d '{"enabled": false}'
```

## Frontend compatibility

CORS is configured wide-open (`origins="*"`, `GET/POST/OPTIONS/PUT/DELETE`,
`Content-Type`/`Authorization` headers) so the Vanilla-JS/Vite frontend on
`http://localhost:5173` can call every endpoint without preflight errors.

## Monitoring

- `http_requests_total{method, endpoint, status_code}`
- `http_request_duration_seconds{method, endpoint}` (histogram)

## Resilience notes

- Pool: `pool_size=10`, `max_overflow=20`, `pool_recycle=1800`,
  `pool_pre_ping=True` — recovers from stale/idle MySQL connections.
- The app boots even if MySQL is down; `/readyz` reports 503 so Kubernetes
  removes the pod from service without crash-looping it.
- Order creation runs in one transaction with `SELECT ... FOR UPDATE` row locks
  to prevent overselling stock, and rolls back cleanly on any failure.