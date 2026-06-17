# ValiData — Project Overview

## What is ValiData?

ValiData is a **Data Quality & Observability platform** for **Snowflake** and **Databricks** warehouses.
It lets teams define quality rules, profile columns, track anomalies, explore lineage, and chat with an AI agent — all without extracting data out of the warehouse.

**Core principle → Pushdown Architecture:** ValiData generates SQL, pushes it into the warehouse, and only retrieves scores/counts back. Raw data never leaves the warehouse.

---

## Block Diagram

```mermaid
block-beta
  columns 3

  block:frontend:3
    columns 3
    A["🖥️ React Frontend (Vite + TypeScript)"]
    B["Pages: Dashboard · Catalog · DQ Detail · Rule Studio · Lineage · AI Agent · Admin"]
    C["Hosted on Vercel"]
  end

  space:3

  block:backend:3
    columns 3
    D["⚙️ FastAPI Backend (Python)"]
    E["Routes: auth · rules · metadata · lineage · analytics · ai_agent"]
    F["Hosted on Render"]
  end

  space:3

  block:engines:3
    columns 4
    G["🧠 Query Generator"]
    H["🔗 Lineage Engine"]
    I["📊 Usage Analyzer"]
    J["🤖 AI Prompts"]
  end

  space:3

  block:connectors:2
    columns 2
    K["❄️ Snowflake Connector"]
    L["🧱 Databricks Connector"]
  end

  block:metadb:1
    M["🗄️ Metadata DB\nPostgres (cloud)\nor SQLite (local)"]
  end

  space:3

  block:warehouses:3
    columns 2
    N["❄️ Snowflake\nData Cloud"]
    O["🧱 Databricks\nSQL Warehouse"]
  end

  frontend --> backend
  backend --> engines
  engines --> connectors
  connectors --> warehouses
  backend --> metadb
```

---

## How It Works (5 Steps)

1. **User logs in** → credentials stored in browser, warehouse creds entered in Connection Vault
2. **User browses** → frontend calls backend → backend generates SQL (via `QueryGenerator`) → SQL runs inside Snowflake/Databricks → metadata comes back
3. **User defines rules** → e.g. "Column X must not be NULL" → rule saved in Metadata DB
4. **User executes rules** → backend pushes DQ SQL into warehouse → gets `{total_rows, failed_rows}` → computes DQ score → logs result + creates anomaly if failed
5. **User schedules** → backend runs rules on a timer (background thread) → stores results automatically

---

## What's Stored Where

| Store | What lives there |
|---|---|
| **Snowflake / Databricks** | All actual data — ValiData only reads it via SQL, never copies it |
| **Metadata DB** (Postgres or SQLite) | Users, rules, rule executions, anomalies, DQ scores, schedules, column profiles, audit logs |
| **Browser localStorage** | Auth token, warehouse credentials, selected platform/role |

---

## Tech Stack at a Glance

| | Technology |
|---|---|
| **Frontend** | React 19 · TypeScript · Vite 8 · React Flow (lineage graphs) · Lucide (icons) |
| **Backend** | FastAPI · Python · Uvicorn |
| **Connectors** | `snowflake-connector-python` · `databricks-sql-connector` |
| **AI** | Snowflake Cortex (Mistral-large) · Databricks AI Functions (Llama 3) — runs inside the warehouse |
| **Metadata DB** | PostgreSQL (Neon, cloud) or SQLite (local dev) |
| **Deploy** | Vercel (frontend) · Render (backend) · Neon (DB) |
