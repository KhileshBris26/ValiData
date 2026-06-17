# ValiData — Developer Guide

> **Read this once. Know the entire codebase.**
>
> This is the single source of truth for understanding ValiData's architecture, code structure, and data flows. If you're a new developer, start here.

---

## 1. What ValiData Does (30-second summary)

ValiData is a **Data Quality & Observability platform** for **Snowflake** and **Databricks** warehouses.

**Core idea:** Data never leaves the warehouse. ValiData generates SQL queries, pushes them into the warehouse for execution, and only retrieves metadata results (counts, scores, column stats). This is called **"Pushdown Architecture"**.

**What users can do:**
- **Connect** to Snowflake or Databricks with their credentials
- **Browse** their data warehouse via a live Data Catalog
- **Profile** tables and columns (null counts, unique counts, min/max, top values)
- **Define DQ rules** (null check, unique check, range check, pattern check, blank check)
- **Execute rules** — SQL runs inside the warehouse, results are scored
- **Schedule** recurring DQ runs (profile + evaluate)
- **See lineage** — inferred table relationships from schema metadata
- **Chat with an AI Agent** — powered by Snowflake Cortex / Databricks AI Functions (LLMs run inside the warehouse)
- **View analytics** — query history, usage patterns, warehouse activity

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Frontend** | React 19 + TypeScript + Vite 8 | SPA, all pages under `frontend/src/pages/` |
| **Backend** | FastAPI (Python) | Async API server, all routes under `routes/` |
| **Metadata DB** | PostgreSQL (Neon) _or_ SQLite | Auto-detects: if `DATABASE_URL` env var is set → Postgres; otherwise → local `users.db` SQLite |
| **Data Warehouses** | Snowflake, Databricks | Connected via `snowflake-connector-python`, `databricks-sql-connector` |
| **AI** | Snowflake Cortex (Mistral-large), Databricks AI Functions (Llama 3) | LLMs run inside the warehouse — no OpenAI key needed |
| **Deployment** | Vercel (frontend), Render (backend), Neon (DB) | Auto-deploy on `git push` |

---

## 3. Directory Structure

```
ValiData/
│
├── main.py                    ← FastAPI app entry point (registers all routers)
├── requirements.txt           ← Python dependencies
├── .env                       ← Local env vars (never committed to Git)
├── .gitignore
│
├── db/                        ← Database layer
│   ├── __init__.py            ← Re-exports everything from connection.py + init.py
│   ├── connection.py          ← DB connection factory, engine singletons, credential helpers
│   └── init.py                ← Schema creation (all CREATE TABLE statements + migrations)
│
├── connectors/                ← Raw warehouse connectors (thin wrappers)
│   ├── base.py                ← Abstract base class: connect(), execute_query(), disconnect()
│   ├── snowflake_connector.py ← Snowflake implementation
│   └── databricks_connector.py← Databricks implementation
│
├── services/                  ← Business logic layer (uses connectors + query generator)
│   ├── snowflake_service.py   ← Snowflake-specific operations (catalog, preview, lineage, DQ)
│   └── databricks_service.py  ← Databricks-specific operations (same interface)
│
├── core/                      ← Shared logic & engines
│   ├── context.py             ← ContextVar for current logged-in user
│   ├── query_generator.py     ← THE SQL BRAIN — generates all DQ, profiling, AI, metadata SQL
│   ├── lineage_engine.py      ← Infers table relationships from INFORMATION_SCHEMA columns
│   ├── usage_analyzer.py      ← Parses query history to find most-used tables/columns
│   └── prompts.py             ← System prompts for the AI Agent chat
│
├── models/                    ← Pydantic request/response models
│   ├── rules.py               ← All API request models (rules, auth, metadata, AI, etc.)
│   └── catalog_metadata.py    ← Data catalog metadata models
│
├── routes/                    ← FastAPI route handlers (API endpoints)
│   ├── auth.py                ← Login, register, forgot-password, credentials, roles, admin
│   ├── rules.py               ← Rule execution, dashboard metrics, anomalies, schedules
│   ├── metadata.py            ← Catalog browse, column profiling, table preview, metadata save
│   ├── lineage.py             ← Lineage inference endpoints
│   ├── analytics.py           ← Usage analytics, query history, warehouse analytics
│   └── ai_agent.py            ← AI rule suggestions, AI chat, table summary
│
├── frontend/                  ← React SPA
│   ├── src/
│   │   ├── App.tsx            ← Router + layout (Sidebar, TopBar, protected routes)
│   │   ├── api.ts             ← API base URL config
│   │   ├── main.tsx           ← React entry point
│   │   ├── pages/             ← One file per page/tab
│   │   ├── components/        ← Shared UI components (Sidebar, TopBar, SearchableDropdown)
│   │   ├── context/           ← React Context (PlatformContext for Snowflake/Databricks toggle)
│   │   ├── hooks/             ← Custom hooks (useClickOutside)
│   │   └── services/          ← API service layer (authService.ts)
│   ├── package.json
│   └── vite.config.ts
│
├── scripts/                   ← SQL setup scripts
│   └── snowflake_dq_setup.sql
│
├── test_*.py                  ← Standalone test scripts (not pytest)
└── patch_*.py                 ← One-time migration/hotfix scripts (historical)
```

---

## 4. How It All Connects — The Big Picture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                             │
│                                                                     │
│  LoginPage → Dashboard → DataCatalog → TableDetail → DQDetail      │
│               AIAgent    RuleStudio    LineageStudio  Connections    │
│                                                                     │
│  All pages call  ──→  fetch(`${API_BASE}/...`)                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP (JSON)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI)                                │
│                                                                     │
│  main.py  ──registers──→  routes/auth.py                            │
│                            routes/rules.py                          │
│                            routes/metadata.py                       │
│                            routes/lineage.py                        │
│                            routes/analytics.py                      │
│                            routes/ai_agent.py                       │
│                                                                     │
│  Routes call ──→  services/snowflake_service.py                     │
│                   services/databricks_service.py                    │
│                   core/query_generator.py  (generates SQL)          │
│                   core/lineage_engine.py   (infers relationships)   │
│                   db/connection.py         (metadata DB access)     │
│                                                                     │
│  Services call ──→  connectors/snowflake_connector.py               │
│                      connectors/databricks_connector.py             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ SQL queries pushed down
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              DATA WAREHOUSE (Snowflake / Databricks)                │
│                                                                     │
│  • DQ rule SQL executes here (NULL_CHECK, UNIQUE_CHECK, etc.)       │
│  • Profiling queries execute here (min, max, nulls, top values)     │
│  • AI/LLM queries execute here (Cortex / AI Functions)              │
│  • Metadata queries execute here (SHOW TABLES, DESCRIBE, etc.)      │
│                                                                     │
│  Only counts/scores come back ──→ never raw data                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│              METADATA DB (PostgreSQL / SQLite)                       │
│                                                                     │
│  Stores: users, rules, rule_executions, anomalies,                  │
│          dq_run_history, schedules, column_profiles,                │
│          data_catalog_metadata, audit logs                          │
│                                                                     │
│  Dual-driver: if DATABASE_URL → PostgreSQL, else → SQLite           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Backend — Module-by-Module

### 5.1 `main.py` — The Entry Point

- Creates the FastAPI `app`
- Enables CORS (allows all origins for dev)
- Adds middleware to capture the logged-in user from `x-robin-user` header
- Calls `init_db()` to create/migrate all database tables
- Registers all 6 route modules

### 5.2 `db/` — Database Layer

| File | Purpose |
|---|---|
| `connection.py` | `get_db_connection()` → returns `(conn, cursor)` for Postgres or SQLite. Also creates global singletons: `snowflake_engine`, `databricks_engine`, `snowflake_svc`, `databricks_svc`. Contains `get_platform_table()` which maps generic table names to platform-specific ones (e.g., `rules` → `snowflake_rules`). |
| `init.py` | `init_db()` → runs all `CREATE TABLE IF NOT EXISTS` statements for both Postgres and SQLite. Also runs schema migrations (adding columns to `users`) and one-time data migrations (splitting generic tables into platform-specific ones). |

**Key pattern:** Throughout the codebase you'll see `if DATABASE_URL ... %s else ... ?` — this is because PostgreSQL uses `%s` placeholders and SQLite uses `?`. Every query has both variants.

**Platform-specific tables:** Rules, executions, anomalies, run history, and profiles are stored in separate tables per platform: `snowflake_rules`, `databricks_rules`, `snowflake_rule_executions`, etc. The `get_platform_table(base_name, platform)` function handles this routing.

### 5.3 `connectors/` — Warehouse Connectors

Thin wrappers that implement `connect(creds)`, `execute_query(sql)`, `disconnect()`.

- **SnowflakeConnector**: Uses `snowflake.connector.connect()`, returns `cursor.fetchall()` as list of dicts
- **DatabricksConnector**: Uses `databricks.sql.connect()`, same interface

These never contain business logic — they just run SQL and return results.

### 5.4 `services/` — Business Logic

`SnowflakeService` and `DatabricksService` provide higher-level operations:

| Method | What it does |
|---|---|
| `get_catalog_tables(creds)` | Runs `SHOW TABLES` and maps results to a standard format |
| `get_table_preview(creds, db, schema, table)` | Runs `SELECT * ... LIMIT 100` |
| `infer_lineage(creds, db, schema)` | Queries INFORMATION_SCHEMA, feeds to LineageEngine |
| `get_usage_analytics(creds, days)` | Queries QUERY_HISTORY, feeds to UsageAnalyzer |
| `execute_dq_rule(creds, sql)` | Runs a DQ rule SQL, returns normalized results |
| `suggest_rules_ai(creds, table, column)` | Runs AI pushdown SQL for rule suggestions |
| `fetch_column_metadata(creds, ...)` | Gets column types/nullability from INFORMATION_SCHEMA |
| `sample_failed_records(creds, ...)` | Fetches sample rows that failed DQ checks |
| `generate_table_summary(creds, table)` | AI-generated table description |

### 5.5 `core/` — Shared Engines

| File | Purpose |
|---|---|
| `query_generator.py` | **The SQL brain.** Static methods that generate platform-specific SQL for: DQ rules (NULL_CHECK, UNIQUE_CHECK, RANGE_CHECK, PATTERN_CHECK, BLANK_CHECK, MIN_MAX_PROFILE), metadata (SHOW DATABASES/SCHEMAS/TABLES, DESCRIBE), profiling (CTEs for null count, distinct count, top values), AI (Cortex/AI Functions), lineage (INFORMATION_SCHEMA), catalog, query history, data overlap validation |
| `lineage_engine.py` | Takes `INFORMATION_SCHEMA.COLUMNS` data and infers table relationships using 3 strategies: (A) exact column name match, (B) FK naming convention (`table_id`), (C) fuzzy name matching (using `thefuzz` library). Outputs React Flow-compatible nodes and edges. |
| `usage_analyzer.py` | Parses raw SQL query text using `sqlglot` to extract referenced tables, columns, and join keys. Returns top-used tables/columns for analytics dashboard. |
| `context.py` | Single `ContextVar` to track the currently logged-in user across async requests. |
| `prompts.py` | System prompt text for the AI Agent chat feature. |

### 5.6 `models/` — Pydantic Models

All API request models live in `models/rules.py`. Key ones:

| Model | Used by |
|---|---|
| `RuleExecutionRequest` | `POST /rules/execute` |
| `MetadataRequest` | `POST /metadata/entities` |
| `ProfileRequest` | `POST /metadata/profile` |
| `CatalogRequest` | `POST /catalog/tables` |
| `LineageRequest` | `POST /lineage/infer` |
| `AIChatRequest` | `POST /ai/chat` |
| `SuggestRulesRequest` | `POST /dq/suggest-rules` |
| `ApplyRulesRequest` | `POST /dq/apply-rules` |
| `ScheduleCreateUpdate` | `POST /dashboard/schedules` |
| `ExecutionLogRequest` | `POST /dashboard/executions` |
| `RuleSyncRequest` | `POST /dashboard/rules/sync` |
| `DashboardRequest` | Various dashboard endpoints |
| `FetchRolesRequest` | `POST /auth/fetch-roles` |

Auth-specific models (AuthRequest, RegisterRequest, etc.) are defined directly in `routes/auth.py`.

### 5.7 `routes/` — API Endpoints

#### `routes/auth.py` — Authentication & User Management

| Endpoint | Purpose |
|---|---|
| `POST /auth/register` | Create new user (status = PENDING until admin approves) |
| `POST /auth/login` | Authenticate user, return token + user data |
| `POST /auth/forgot-password` | Generate OTP, send via Resend email API |
| `POST /auth/reset-password` | Verify OTP, reset password |
| `POST /auth/update_credentials` | Save warehouse credentials for a user |
| `POST /auth/update_role` | Add a Snowflake/Databricks role to user's role list |
| `POST /auth/test-connection` | Test if warehouse credentials work |
| `POST /auth/fetch-roles` | Query Snowflake `SHOW GRANTS` or Databricks `SHOW GROUPS` |
| `POST /auth/fetch-warehouses` | Query Snowflake `SHOW WAREHOUSES` |
| `GET /admin/users` | List all users (admin panel) |
| `POST /admin/users/{id}/status` | Approve, reject, or revoke user access |
| `DELETE /admin/users/{id}` | Delete user account |
| `POST /admin/users/{id}/admin_access` | Toggle admin role |

#### `routes/rules.py` — Rules, Dashboard, and Scheduling

This is the **largest route file**. It handles:

| Endpoint | Purpose |
|---|---|
| `POST /rules/execute` | Execute a single DQ rule against the warehouse |
| `GET /dq/runs` | Fetch DQ run history from Snowflake |
| `GET /dq/runs/{run_id}` | Fetch details of a specific DQ run |
| `GET /dashboard/metrics` | Counts: active rules, passed checks, anomalies |
| `GET /dashboard/rules` | List all saved DQ rules |
| `GET /dashboard/anomalies` | List active anomalies |
| `POST /dashboard/anomalies/resolve` | Mark an anomaly as resolved |
| `POST /dashboard/rules/sync` | Bulk sync rules from frontend to DB |
| `POST /dashboard/executions` | Log batch execution results + auto-create anomalies |
| `GET /dashboard/invalid_records` | List failed execution records for a table |
| `POST /dashboard/sample_failed_records` | Fetch sample rows that failed checks |
| `GET /dashboard/run_history` | DQ run history for a specific table |
| `GET /dashboard/executions/latest` | Latest execution results for a table |
| `GET /dashboard/schedules` | Get/create schedules for a table |
| `POST /dashboard/schedules` | Create/update a schedule |
| `PATCH /dashboard/schedules/{id}` | Enable/disable a schedule |
| `POST /dashboard/schedules/{id}/run` | Trigger a scheduled run immediately (in background thread) |

**Scheduling system:** Supports frequencies: 5/10/20/30 min, 1/4/6/12/24 hr, weekly (specific days), monthly (specific date or nth weekday), and custom intervals. The `execute_schedule_job()` function runs in a background thread and performs either a "profile" or "evaluate" run against the warehouse.

#### `routes/metadata.py` — Data Catalog & Profiling

| Endpoint | Purpose |
|---|---|
| `POST /metadata/entities` | Browse warehouse: list databases, schemas, tables, or columns |
| `POST /metadata/profile` | Profile a single column (null count, distinct, min/max, top values) |
| `POST /metadata/row_count` | Get row count for a table |
| `POST /metadata/preview` | Get sample data (100 rows) |
| `POST /metadata/save` | Save column description + glossary terms (MERGE INTO warehouse table) |
| `POST /metadata/fetch` | Fetch saved metadata for a column |
| `POST /metadata/fetch-all` | Fetch all table-level metadata |
| `POST /catalog/tables` | List all tables across the entire warehouse account |
| `GET /dashboard/catalog-quality-scores` | Latest DQ score per table for catalog view |

#### `routes/lineage.py` — Lineage Studio

| Endpoint | Purpose |
|---|---|
| `POST /lineage/infer` | Infer table relationships for a database.schema |
| `POST /dashboard/lineage` | Auto-detect database/schema, then infer lineage |

#### `routes/analytics.py` — Usage Analytics & Query History

| Endpoint | Purpose |
|---|---|
| `POST /analytics/usage` | Top tables, columns, and join keys from query history |
| `POST /dashboard/warehouse_analytics` | Most-read table + its DQ score |
| `POST /dashboard/query_logs` | Recent DQ run log entries |
| `POST /dashboard/query_history` | Full query history (remote from warehouse, local fallback, or simulated) |

#### `routes/ai_agent.py` — AI Features

| Endpoint | Purpose |
|---|---|
| `POST /ai/suggest_rules` | AI-powered rule suggestions for a column |
| `POST /dq/suggest-rules` | Rule-based + AI suggestion engine (generates rules from column metadata) |
| `POST /dq/apply-rules` | Persist suggested rules to the database |
| `POST /ai/chat` | Multi-turn AI chat (uses Snowflake Cortex or Databricks AI) |
| `POST /ai/test` | Test if Cortex AI is available |
| `POST /ai/table_summary` | AI-generated table description |

---

## 6. Database Schema (Metadata DB)

All tables exist in both generic and platform-specific variants (`snowflake_rules`, `databricks_rules`, etc.).

| Table | Purpose | Key Columns |
|---|---|---|
| `users` | User accounts | username, password_hash, status (PENDING/APPROVED/REJECTED/REVOKED), platform, credentials (JSON), roles (JSON), otp_code, otp_expires_at |
| `{plat}_rules` | Saved DQ rules | platform, database_name, schema_name, table_name, column_name, rule_type, rule_params (JSON), status |
| `{plat}_rule_executions` | DQ rule execution logs | platform, table_name, column_name, rule_type, total_rows, failed_rows, status |
| `{plat}_anomalies` | Auto-detected anomalies | title, msg, type, status (Active/Resolved) |
| `{plat}_dq_run_history` | DQ run results | table_name, run_date, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms |
| `{plat}_column_profiles` | Cached column profiles | database_name, schema_name, table_name, profile_data (JSON) |
| `schedules` | DQ run schedules | platform, database/schema/table, run_type (profile/evaluate), frequency, custom_config (JSON), enabled, next_run_time |
| `data_catalog_metadata` | Column descriptions & terms | table_name, column_name, description, terms (JSON), is_auto_generated |
| `metadata_audit_log` | Metadata change audit trail | action, old_value, new_value, user_name |
| `robin_query_logs` | Locally tracked query executions | platform, username, query_text, status, elapsed_time_ms |
| `dq_role_fetch_logs` | Logs of role fetch attempts | user_name, query_executed, roles_returned, status |
| `dq_rule_generation_logs` | Logs of AI rule generation | request_id, table_name, columns_selected, rules_generated, status |

---

## 7. Frontend — Page-by-Page

### Navigation Structure

```
Login Page (public)
│
└── Authenticated Shell (TopBar + Sidebar + Content)
    ├── / ........................... Dashboard (metrics, recent runs, warehouse analytics)
    ├── /ai-agent .................. AI Chat Agent
    ├── /studio .................... Rule Studio (cascading dropdowns → execute rules)
    ├── /lineage ................... Lineage Studio (React Flow graph)
    ├── /analytics ................. Usage Analytics (top tables, columns, joins)
    ├── /query-history ............. Query History viewer
    ├── /connections ............... Connection Vault (enter warehouse credentials)
    ├── /catalog ................... Data Catalog (table browser)
    │   └── /catalog/:db/:schema/:table ... Table Detail (columns, profiling, preview)
    │       └── .../dq/primary ............ DQ Detail (rules, scores, executions)
    │           └── .../create-rule/:col .. Create Rule (popup)
    ├── /rule/:ruleName ............ Rule Detail
    ├── /observability/connections . Observability Connections
    │   └── /observability/connections/:id  Connection Detail
    ├── /observability/alerts ...... Observability Alerts
    └── /admin-dashboard ........... Admin Dashboard (user management)
```

### Key Frontend Concepts

- **PlatformContext**: React Context that tracks the selected platform (Snowflake/Databricks). Every API call includes the platform and credentials from this context.
- **ProtectedRoute**: Wrapper component that redirects to `/login` if no auth token exists.
- **Inactivity auto-logout**: After 15 minutes of no mouse/keyboard activity, the session is cleared.
- **Credentials flow**: User enters warehouse creds in Connection Vault → stored in `localStorage` → sent with every API call in the request body (not headers).
- **Mock encryption**: Passwords/tokens are "encrypted" on the frontend (reverse + base64 with `mock_enc_` prefix) and decrypted on the backend. This is for transit obfuscation, not real security.

### Key Frontend Files by Size (where the complexity lives)

| File | Lines | What's inside |
|---|---|---|
| `TableDetail.tsx` | 2,735 | Column list, profiling panel, data preview, scheduling, metadata editing |
| `DataQualityDetail.tsx` | 2,522 | Rule execution UI, DQ scores, failed record viewer, rule configuration |
| `LoginPage.tsx` | 1,284 | Login, register, forgot-password, OTP reset — all in one page |
| `AIAgent.tsx` | 1,144 | Chat interface, message history, AI-powered responses |
| `ObservabilityAlerts.tsx` | 830 | Alert dashboard |
| `Dashboard.tsx` | 660 | Main dashboard with metrics cards, recent runs, warehouse analytics |

---

## 8. How DQ Rule Execution Works (End to End)

This is the most important flow in the app:

```
1. User selects: Platform → Database → Schema → Table → Column → Rule Type
                                                              │
2. Frontend calls: POST /api/v1/rules/execute                │
   Body: { platform, table_name, column_name, rule_type,     │
           rule_params, credentials }                         │
                                                              ▼
3. Backend (routes/rules.py):
   → QueryGenerator.generate_dq_rule_sql(platform, table, column, rule_type, params)
   → Returns platform-specific SQL, e.g.:
     "SELECT COUNT(*) AS total_rows,
      SUM(CASE WHEN col IS NULL THEN 1 ELSE 0 END) AS failed_rows
      FROM db.schema.table"
                                                              │
4. Backend sends SQL to warehouse:                            │
   → snowflake_svc.execute_dq_rule(credentials, sql)          │
   → Connector connects, runs SQL, returns [{total_rows: 1000, failed_rows: 42}]
                                                              │
5. Backend logs results:                                      │
   → INSERT INTO snowflake_rule_executions (...)               │
   → If failed_rows > 0: INSERT INTO snowflake_anomalies (...) │
   → Auto-creates/updates rule in snowflake_rules              │
                                                              │
6. Returns to frontend: { status: "success", execution: [...] }
```

---

## 9. Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```env
# Snowflake credentials (for local dev / fallback)
SNOWFLAKE_ACCOUNT=your_account
SNOWFLAKE_USER=your_user
SNOWFLAKE_PASSWORD=your_password
SNOWFLAKE_ROLE=your_role
SNOWFLAKE_WAREHOUSE=your_warehouse
SNOWFLAKE_DATABASE=your_database
SNOWFLAKE_SCHEMA=your_schema

# Databricks credentials (for local dev / fallback)
DATABRICKS_SERVER_HOSTNAME=your_host
DATABRICKS_HTTP_PATH=your_http_path
DATABRICKS_ACCESS_TOKEN=your_token

# PostgreSQL (for cloud deployment — omit for local SQLite)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Email OTP (optional — uses Resend API)
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=ValiData <onboarding@resend.dev>
```

**If `DATABASE_URL` is not set**, the app automatically uses a local `users.db` SQLite file (created on first run). This is the default for local development.

---

## 10. Local Development Setup

```powershell
# 1. Backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 2. Frontend (separate terminal)
cd frontend
npm install
npm run dev
# → Open http://localhost:5173
```

**Default admin account:** `Khilesh` / `ValiData26` (auto-created on first startup)

**First login flow:**
1. Register a new account (status = PENDING)
2. Login as admin (`Khilesh`) → Admin Dashboard → Approve the account
3. Login as the new account → Connection Vault → Enter warehouse credentials
4. Browse the Data Catalog

---

## 11. Deployment

| Component | Platform | Trigger |
|---|---|---|
| Frontend | **Vercel** | Auto-deploys on `git push` to main |
| Backend | **Render** | Auto-deploys on `git push` to main |
| Database | **Neon** (PostgreSQL) | Always-on serverless; connected via `DATABASE_URL` |

**Vercel build command:** `tsc -b && vite build` (strict mode — unused imports will fail the build)

**Render cold starts:** On the free tier, the backend sleeps after 15 min of inactivity. First request after sleep takes ~30s.

---

## 12. Key Patterns & Conventions

### Dual-DB Placeholder Pattern
```python
# This pattern appears 50+ times in the codebase:
query = "SELECT * FROM users WHERE username = %s" if DATABASE_URL else "SELECT * FROM users WHERE username = ?"
cursor.execute(query, (username,))
```

### Platform Routing Pattern
```python
# Generic table name → platform-specific table
tbl_rules = get_platform_table('rules', platform)  # → "snowflake_rules" or "databricks_rules"
```

### Service Dispatch Pattern
```python
# Routes dispatch to platform-specific service:
if request.platform == "snowflake":
    result = snowflake_svc.some_method(request.credentials, ...)
elif request.platform == "databricks":
    result = databricks_svc.some_method(request.credentials, ...)
```

### Credential Flow
```
Frontend: User enters creds → stored in localStorage → sent in request body
Backend: Reads from request body → passes to connector.connect(creds)
Fallback: If no creds in request → get_saved_credentials(platform) reads from DB
```

---

## 13. Quick Reference: "Where do I find...?"

| If you want to... | Look at... |
|---|---|
| Add a new DQ rule type | `core/query_generator.py` → `generate_dq_rule_sql()` |
| Add a new API endpoint | Create or edit a file in `routes/`, register in `main.py` |
| Add a new frontend page | Create `pages/NewPage.tsx`, add route in `App.tsx` |
| Change database schema | `db/init.py` → add to both Postgres and SQLite blocks |
| Add a new Pydantic model | `models/rules.py` |
| Debug warehouse connectivity | `connectors/snowflake_connector.py` or `databricks_connector.py` |
| Change AI prompts | `core/prompts.py` |
| Change lineage inference logic | `core/lineage_engine.py` |
| Add a sidebar nav item | `frontend/src/components/Sidebar.tsx` |
| Change API base URL | `frontend/src/api.ts` (or set `VITE_API_BASE` env var) |

---

## 14. Gotchas & Things to Watch Out For

1. **Vercel strict builds**: Any unused TypeScript import blocks the build. Always clean up imports before pushing.

2. **Snowflake Cortex on Trial accounts**: Trial Snowflake accounts have Cortex AI disabled. The AI Agent has fallback logic (hardcoded responses) for this case.

3. **Case sensitivity**: Snowflake returns column names in UPPER_CASE, Databricks in lower_case. Throughout the codebase, you'll see `row.get('NAME') or row.get('name')` to handle both.

4. **Global engine singletons**: `snowflake_engine` and `databricks_engine` are created once at import time in `db/connection.py`. They are shared across requests. `connect()` and `disconnect()` are called per-request in route handlers.

5. **No real authentication tokens**: The "token" returned on login is just `token_{username}_{hash[:10]}`. There's no JWT or OAuth. Security is minimal (POC-grade).

6. **Scheduling runs in threads**: `execute_schedule_job()` runs in a Python `threading.Thread`. There's no task queue (Celery, etc.) — this is POC-level scheduling.

7. **Patch files**: The `patch_*.py` files at the root are one-time migration scripts that were used during development. They are not part of the running application.
