# API BoilerPlate

## Overview
This directory contains a robust, enterprise-grade Backend API server implementing a standard CRUD (Create, Read, Update, Delete) interface. It goes beyond a simple "crude" server by incorporating strict type safety, runtime validation, automated module scaffolding, and an isolated integration testing environment.

## Tech Stack
* **Runtime:** Node.js
* **Framework:** Express.js
* **Language:** TypeScript
* **Validation:** Zod
* **Database / ORM:** Prisma with PostgreSQL
* **Testing:** Jest & Supertest (Isolated Test DB)
* **Automation:** Plop.js (for consistent module scaffolding)

## API Endpoints
The server exposes the following RESTful interface for the resource:
* `POST /resource` - Create a new record
* `GET /resource` - List all records (supports pagination/filtering)
* `GET /resource/:id` - Fetch a specific record by ID
* `PATCH /resource/:id` - Update an existing record
* `DELETE /resource/:id` - Delete a record

## Configuration & Setup
To ensure data integrity, this project strictly separates development data from testing data. **You will need two separate databases.**

### 1. Development Environment (`.env`)
Create a `.env` file in the root of the `problem5` directory. Use the `.env.example` as a template:

```env
# Server Configuration
NODE_ENV=development

# Database Connection (Development)
DATABASE_URL="postgresql://user:password@localhost:5432/crude_db?schema=public"

# Authentication & Security
JWT_SECRET="super_secret_jwt_key_"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="super_refresh_secret_jwt_key_"
JWT_REFRESH_EXPIRES_IN="7d"
BCRYPT_SALT_ROUNDS=12

# CORS Configuration (Next.js Frontend)
CLIENT_URL="http://localhost:3000"

# Redis Cache (local Docker; use the rediss:// Upstash URL in production)
REDIS_URL="redis://localhost:6380"
SOCKET_REDIS_ADAPTER=false
LIVE_SENSOR_CACHE_FLUSH_SECONDS=300
```

#### Redis & the Upstash free tier
- **Local:** `docker compose up -d` starts Redis on `localhost:6380` (6379 is often taken by other projects).
- **Socket.IO adapter:** `SOCKET_REDIS_ADAPTER=true` routes every socket emit through Redis `PUBLISH`. Only enable it when running more than one API instance; on a single instance it burns Upstash commands for nothing.
- **Live sensor cache:** the simulation writes the latest values for each airport (`live:sensors:<CODE>`) to process memory on every tick, and to Redis only every `LIVE_SENSOR_CACHE_FLUSH_SECONDS`. Identical writes are skipped. `GET /api/v1/sensors/live?airportId=VVLT` reads memory first, then Redis, then Postgres.
- Rough cost with defaults: ~1 write per airport every 5 min (~17K commands/month for 2 airports) plus cache misses for static data.

#### Sensor history (datatable)
- The simulation stores one raw sample per sensor per minute (`sensor_logs`) and keeps it for `SENSOR_RAW_RETENTION_HOURS` (default 48 h).
- Every minute it refreshes hourly rollups (`sensor_log_hourly`: min / max / avg / sample count), kept for `SENSOR_ROLLUP_RETENTION_DAYS` (default 400 days). Roughly 100 MB for ~80 sensors over a year.
- `GET /api/v1/sensors/:id/series?startDate=&endDate=&granularity=auto|raw|hour|day&tz=Asia/Ho_Chi_Minh` returns rows + summary for any period up to 400 days. `day` buckets follow local calendar days in `tz`; `auto` picks raw (≤ 6 h, inside the raw window), hourly (≤ 3 days) or daily.

---

### 2. Test Environment (.env.test)
Create a `.env.test` file. The test suite connects to this isolated database so it can safely wipe data between test runs without destroying your development data.

```env
# Server Configuration
NODE_ENV=test

# Database Connection (Isolated Testing)
# MUST BE A DIFFERENT DATABASE THAN DEVELOPMENT
DATABASE_URL="postgresql://user:password@localhost:5432/crude_test_db?schema=public"

# Authentication & Security
JWT_SECRET="super_secret_jwt_key_"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="super_refresh_secret_jwt_"
JWT_REFRESH_EXPIRES_IN="7d"
BCRYPT_SALT_ROUNDS=12

# CORS Configuration (Next.js Frontend)
CLIENT_URL="http://localhost:3000"
```

## Installation & Database Setup

### 1. Install Dependencies:
Navigate into the directory and install the required dependencies:
```bash
npm run install
```
(Note: postinstall will automatically generate the Prisma client).

### 2. Run Database Migrations:
Synchronize the Prisma schema with your development database:
```bash
npm run db:migrate
```

### 3. Seed the Database (Optional):
Populate the development database with initial mock data:
```bash
npm run db:seed
```

---

## Running the Application

### Development Mode
To start the server with hot-reloading (ideal for active development):
```bash
npm run dev
```
The server will typically start on `http://localhost:5000`.

### Production Build
Compiles TypeScript to JavaScript, resolves path aliases (`tsc-alias`), and runs the optimized build:
```bash
npm run build
npm run start
```

### Docker / Deployment
The multi-stage `Dockerfile` produces a slim, non-root runtime image (production dependencies + compiled `dist`, with the Prisma client generated for Debian). Migrations run from a separate `migrate` target, so the runtime image carries no Prisma CLI.

```bash
# Build and run (pass env vars from your platform, or a docker-format env file)
docker build -t digital-twin-airport-api .
docker run -p 5050:5050 -e DATABASE_URL=... -e CLIENT_URL=https://your-web.app -e REDIS_URL=rediss://...   -e JWT_SECRET=... -e JWT_REFRESH_SECRET=... digital-twin-airport-api

# Apply pending migrations before (or after) deploying a new version
docker build --target migrate -t digital-twin-airport-api-migrate .
docker run --rm -e DATABASE_URL=... digital-twin-airport-api-migrate

# Locally with Compose (reads .env; Redis included)
docker compose --profile app up -d --build
docker compose --profile migrate run --rm migrate
```

Deployment checklist:
- **Required env:** `DATABASE_URL`, `CLIENT_URL` (comma-separated web origins, used for CORS + Socket.IO), `JWT_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_URL`. The platform's `PORT` is honoured (default 5050).
- **Supabase:** the direct host `db.<ref>.supabase.co` is IPv6-only. Containers and most PaaS (e.g. Render) have no IPv6 egress, so use the **Session pooler** connection string (`...pooler.supabase.com:5432`) as `DATABASE_URL`.
- **Redis:** `REDIS_URL` with `rediss://` for Upstash; keep `SOCKET_REDIS_ADAPTER=false` unless you run several API instances.
- **`docker run --env-file`** does not strip quotes or inline `# comments` from `.env` lines; use plain `KEY=value` files (Compose's `env_file` handles both).
- **Health check:** `GET /health` (also wired as the image `HEALTHCHECK`).

---

## Testing
The testing suite relies on Jest and native ESM modules. It uses the `.env.test` configuration to connect to the isolated test database.

### 1. Prepare the Test Database:
Ensure your test database exists, then push the schema to it (you can temporarily swap your .env URL or use dotenv-cli if installed):
```bash
npx dotenv -e .env.test -- npx prisma db push
```

### 2. Run Integration Tests (Recommended):
This script runs tests serially (`--runInBand`) to prevent database transaction collisions and enables experimental VM modules for ESM support.
```bash
npm run test:integration
```

### 3. Run Standard Tests / Watch Mode:
```bash
npm test
npm run test:watch
```

---

## Useful Scripts Reference
This project includes several utility scripts for developer productivity:

* `npm run generate`: Launches Plop.js to automatically scaffold a new enterprise module (Controller, Service, Repository, Schema, Route) with boilerplate code.

* `npm run db:studio`: Opens the Prisma Studio GUI in your browser to easily view and edit database records.

* `npm run lint` & `npm run format`: Runs ESLint and Prettier to enforce strict code styling.

* `npm run db:reset`: Drops the database, applies all migrations from scratch, and triggers the seed script.