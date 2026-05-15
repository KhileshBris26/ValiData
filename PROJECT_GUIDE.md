# 🦅 Project ValiData (Robin) - The Definitive Technical & Functional Guide

Welcome to the **ValiData (Project Robin)** master documentation. This guide is an exhaustive resource designed to provide developers, architects, and stakeholders with a 360-degree view of the platform. Whether you are setting up the environment for the first time or deep-diving into the pushdown query logic, this document covers it all.

---

## 🌟 1. Project Philosophy & Architecture

### The "Zero-Data Movement" (Pushdown) Architecture
ValiData is built on the fundamental principle that **data should never leave the warehouse**. Traditional DQ tools often extract data into a separate processing engine (e.g., Spark, Pandas), which introduces security risks, latency, and egress costs.

**ValiData solves this by:**
- **Dynamic SQL Orchestration**: The backend generates complex SQL (CTEs, Window Functions, Regex) based on user-defined rules.
- **Compute Offloading**: These queries are "pushed down" to Snowflake or Databricks. The warehouse does the heavy lifting of scanning millions of rows.
- **Metadata-Only Retrieval**: Only the final counts and results (e.g., "15 failed rows") are returned to the UI.

### Technical Flow
1. **Request**: UI triggers a DQ scan.
2. **Generation**: `QueryGenerator` (Backend) assembles the SQL logic.
3. **Execution**: Connector executes the query via the warehouse's native driver.
4. **Serialization**: Results are mapped to professional UI models and snapshotted.

---

## 🛠️ 2. Comprehensive Technology Stack

### Frontend Architecture
- **React 19 (Modern Hooks)**: Utilizes `useMemo`, `useCallback`, and `useEffect` for efficient re-renders and state management.
- **Vite 8**: Provides ultra-fast HMR (Hot Module Replacement) and optimized production builds.
- **TypeScript (Strict Mode)**: Ensures type safety across complex DQ row models and API responses.
- **Custom CSS Variables**: The design system is powered by a central set of tokens in `index.css` (e.g., `--glass-bg`, `--primary-purple`), enabling a consistent "Premium Dark" aesthetic.
- **React Flow**: Powering the Lineage Studio, allowing for interactive, zoomable data flow diagrams.

### Backend Infrastructure
- **FastAPI**: A high-performance Python framework chosen for its asynchronous support and automatic OpenAPI (Swagger) documentation.
- **Pydantic**: Used for strict request/response validation, ensuring the frontend never receives malformed data.
- **Connectors**:
  - `snowflake-connector-python`: Leverages Snowflake's native Arrow format for fast result serialization.
  - `databricks-sql-connector`: Communicates with Databricks SQL Warehouses via the Thrift protocol.
- **SQLite**: A lightweight, file-based database used to store local user accounts and authentication hashes.

---

## 📂 3. Granular Project Structure

### `/Robin` (Root)
- **`main.py`**: The central nervous system. Routes all API requests and manages connector lifecycles.
- **`requirements.txt`**: Lists all Python dependencies (fastapi, uvicorn, pydantic, snowflake-connector, etc.).

### `/connectors`
- **`snowflake_connector.py`**: Manages the Snowflake connection pool, query execution, and session management.
- **`databricks_connector.py`**: Handles Databricks authentication (PAT tokens) and SQL execution.

### `/core`
- **`query_generator.py`**: The "SQL Brain". Contains logic to convert high-level DQ concepts into dialect-specific SQL.
- **`lineage_engine.py`**: Infers data relationships by parsing information schema metadata and identifying foreign key patterns.

### `/frontend`
- **`/src/pages`**:
  - `DataCatalog.tsx`: The primary entry point for discovering data assets.
  - `DataQualityDetail.tsx`: The most complex page, handling profiling, rule snapshotted evaluation, and hover-state logic.
  - `LineageStudio.tsx`: The visual map of the data universe.
  - `AIAgent.tsx`: The GPT-driven workspace for automated DQ management.
- **`/src/api.ts`**: The **Single Source of Truth** for the API URL. Crucial for switching between local development and Vercel production.
- **`/src/context/PlatformContext.tsx`**: Manages the global toggle between Snowflake and Databricks modes.

---

## 🚀 4. Deep-Dive: Functional Tabs & Features

### 1. Data Catalog (The Discovery Engine)
The catalog is split into two views:
- **Published**: Assets that have already been audited and are "Certified" for business use.
- **Discovery**: A raw look at all schemas and tables in the warehouse, allowing users to "onboard" new tables into the monitor.

### 2. Primary DQ Monitor (The Assessment Engine)
This tab is engineered for **Deterministic Accuracy**:
- **Profiling Summary**: Unlike other tools that "guess," ValiData scans the `tablePreview` sample to calculate:
  - **Not Null %**: `(non_null_count / total_rows) * 100`
  - **Distinct %**: `(unique_set_size / total_rows) * 100`
  - **Unique %**: Identifies rows where the value count is exactly 1.
- **Snapshot Evaluation**: When you change a rule, the dashboard doesn't "hallucinate" new scores. You must click **"Profile and Evaluate"** to trigger a fresh scan and lock in a new "snapshot."

### 3. AI Agent (The Intelligence Layer)
The agent uses a "Reasoning + Action" (ReAct) pattern:
- **Thinking Panel**: Shows the AI decomposing the user's request (e.g., "Find PII" -> "Search for EMAIL/SSN columns" -> "Suggest Masking").
- **Rule Generation**: The agent doesn't just talk; it creates functional `RuleInstance` objects that can be applied directly to your warehouse.

### 4. Lineage Studio (The Observability Map)
- **Automatic Inference**: The engine looks for column name matches (e.g., `USER_ID` in Table A and Table B) to suggest potential lineage paths.
- **Interactive Nodes**: Click any table to see its upstream dependencies and downstream consumers.

---

## 🔧 5. How to Resume Development on a New System

### Step 1: Clone & Initialize
```powershell
git clone https://github.com/KhileshBris26/ValiData.git
cd ValiData
```

### Step 2: Backend Orchestration
1. **Environment isolation**:
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   ```
2. **Dependency installation**:
   ```powershell
   pip install -r requirements.txt
   ```
3. **Environment Variables**: Create a `.env` in the root.
   - `OPENAI_API_KEY`: Required for the AI Agent.
   - `PORT`: (Optional) default is 8000.
4. **Launch**:
   ```powershell
   uvicorn main:app --reload --port 8000
   ```

### Step 3: Frontend Orchestration
1. **Dependency installation**:
   ```powershell
   cd frontend
   npm install
   ```
2. **API Endpoint Configuration**: Check `src/api.ts`.
   - Ensure `VITE_API_BASE` points to your backend (usually `http://127.0.0.1:8000/api/v1`).
3. **Development Mode**:
   ```powershell
   npm run dev
   ```

---

## 🛠️ 6. Troubleshooting & FAQ

**Q: Why are my tabs empty or not loading?**
- **A**: Ensure your backend server is running. Check `src/api.ts` to verify the `API_BASE` matches your backend URL. If on a different system, you may need to use `ngrok` or a deployed backend URL.

**Q: The record count says 0 for all tables.**
- **A**: This happens if the database connection fails. Check the **Connection Vault** to ensure your credentials (Snowflake Account, Role, etc.) are correct and that the warehouse is "Started."

**Q: AI Agent is not responding.**
- **A**: Verify your `OPENAI_API_KEY` is correctly set in the root `.env` file. Check the backend terminal for "401 Unauthorized" or "Rate Limit" errors.

**Q: Scoring seems inconsistent.**
- **A**: Remember that scores are **snapshotted**. If you disable a rule, the score won't change until you click **"Profile and Evaluate"** to recalculate the snapshot.

---

## 🔑 7. Maintenance & Security Rules
1. **No Data Extraction**: Never write logic that saves warehouse data to the local SQLite or logs. Keep it in-memory.
2. **Session-Only Credentials**: Always use the session-based approach for passwords. Never store them in the database.
3. **Deterministic Logic**: If you add a new DQ rule, ensure its logic is added to `getRuleScore` in the frontend so it can be evaluated against sample data.

---

*ValiData: Enterprise Trust, Native Performance.*
