# 🦅 Project ValiData (Robin) - The Definitive Technical & Functional Guide

Welcome to the **ValiData (Project Robin)** master documentation. This guide is an exhaustive resource designed to provide developers, architects, and stakeholders with a 360-degree view of the platform.

---

## 🌟 1. Project Philosophy & Architecture

### The "Zero-Data Movement" (Pushdown) Architecture
ValiData is built on the fundamental principle that **data should never leave the warehouse**. Traditional DQ tools often extract data into a separate processing engine, which introduces security risks, latency, and egress costs.

**ValiData solves this by:**
- **Dynamic SQL Orchestration**: The backend generates complex SQL (CTEs, Window Functions, Regex) based on user-defined rules.
- **Native Warehouse AI**: Leverages **Snowflake Cortex** and **Databricks AI Functions** to run LLM logic (Claude 3.5 Sonnet / Llama 3.1) directly inside your warehouse. **No external OpenAI API key is required.**
- **Compute Offloading**: These queries are "pushed down" to Snowflake or Databricks.
- **Metadata-Only Retrieval**: Only the final counts and results are returned to the UI.

### Cloud-Native Infrastructure
- **Frontend**: Hosted on **Vercel** (Global Edge Network).
- **Backend**: Hosted on **Render** (Auto-scaling Python environment).
- **Metadata DB**: Powered by **Neon (Serverless PostgreSQL)** for 24/7 cloud availability, with local fallback to **SQLite**.

---

## 🛠️ 2. Comprehensive Technology Stack

### Frontend Architecture
- **React 19**: Modern hooks-based state management.
- **Vite 8**: Ultra-fast build tool and dev server.
- **TypeScript**: Strict type safety for complex DQ models.
- **React Flow**: Zoomable, interactive Lineage Studio graph.

### Backend Infrastructure
- **FastAPI**: High-performance asynchronous Python framework.
- **Connectors**:
  - `snowflake-connector-python`: Native Snowflake communication.
  - `databricks-sql-connector`: Unity Catalog & SQL Warehouse communication.
- **Database Abstraction**:
  - **Production**: PostgreSQL (Neon) for multi-developer persistence.
  - **Development**: SQLite for isolated, zero-config local work.

---

## 📂 3. Project Structure & Onboarding

### Quick Start
For a step-by-step "First Hour" setup, see the [ONBOARDING.md](./ONBOARDING.md) guide.

### Core Components
- **`main.py`**: API Gateway and Database Routing.
- **`/connectors`**: Platform-specific execution engines.
- **`/core/query_generator.py`**: The "SQL Brain" converting rules to warehouse queries.
- **`/core/lineage_engine.py`**: Metadata-driven relationship inference.

---

## 🚀 4. Functional Tabs & "Truthful" Logic

### 1. Data Catalog
- **Dynamic Discovery**: Scans your warehouse in real-time.
- **Zero Mock Data**: All record counts and attribute counts are fetched live.
- **Trust Index**: Automatically calculated based on quality, freshness, and governance metadata.

### 2. Primary DQ Monitor
- **Profiling Details**: Real-time calculation of **Min, Max, and Average** for all numeric and date columns.
- **Frequent Values**: Dynamic "Top 3" distribution calculated from your actual data sample.
- **Snapshot Evaluation**: Scores are locked in when you click "Profile and Evaluate," ensuring a deterministic audit trail.

### 3. AI Agent (The Intelligence Layer)

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
