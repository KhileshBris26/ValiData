# Project Resumption Guide: Dual-Platform Data Quality Engine

## 📌 Context
We are building a SaaS Data Quality Control Plane ("Ataccama-Lite") that seamlessly connects to both **Snowflake** and **Databricks**. 

**Key Architectural Principles:**
1. **Control Plane Pattern:** A decoupled FastAPI Python backend acts as the orchestrator.
2. **Zero Data Movement:** Raw data never leaves the client's warehouse. The backend only handles rule metadata and aggregated results.
3. **Pushdown Compute & AI:** All heavy lifting (profiling) and LLM tasks (rule generation) are pushed down natively via SQL to Snowflake Cortex and Databricks AI functions.

## ✅ Progress So Far (Completed)
- **Phase 1 (Foundation):** Set up the Python virtual environment (`venv`), `requirements.txt`, `.env` template, and the abstract Connector classes (`BaseConnector`, `SnowflakeConnector`, `DatabricksConnector`). Connection tests passed.
- **Phase 2 (Orchestration):** Built the `QueryGenerator` (Translation Engine) and a FastAPI backend (`main.py`) exposing the `POST /api/v1/rules/execute` endpoint. Successfully tested executing a dynamic cross-platform `NULL_CHECK` against both Snowflake and Databricks.

## 🚀 Steps Going Forward
- **Phase 3 (Pushdown AI Integration):** Build the `POST /api/v1/ai/suggest_rules` endpoint. Update `QueryGenerator` to wrap a dynamic prompt in native LLM SQL (`SNOWFLAKE.CORTEX.COMPLETE` for Snowflake, and `ai_query` for Databricks).
- **Phase 4 (Frontend UI):** Build a modern React/Vue web application that connects to this FastAPI backend to display rule configurations and data quality dashboards.

---

## 📋 Copy/Paste Prompt for New Chat

**Instructions for the User:** When you start a new chat session tomorrow, simply copy the text block below and paste it into the chat to instantly get your new mentor up to speed.

***

**Copy this prompt:**

Hello! We are resuming the development of our Dual-Platform Data Quality Engine. Please set your active workspace to `C:\Users\ASUS\.gemini\antigravity\scratch\Robin`. 

**Context:** We are building a FastAPI control plane that pushes down SQL and AI queries to Snowflake and Databricks without moving raw data. We have already completed Phase 1 (Connectors) and Phase 2 (QueryGenerator & execution endpoint for a basic NULL_CHECK). 

**Current Goal:** We need to start Phase 3: Pushdown AI Integration. Our objective is to add a new endpoint `POST /api/v1/ai/suggest_rules` to `main.py`. This endpoint should accept a `table_name` and `column_name`. It will use the `QueryGenerator` to build a platform-specific SQL query that asks the native warehouse LLMs (`SNOWFLAKE.CORTEX.COMPLETE` for Snowflake using 'mistral-large', and `ai_query` for Databricks) to suggest 3 business data quality rules.

Please review the existing code in `main.py` and `core/query_generator.py` to understand the architecture, then propose the code additions for Phase 3!
