# Project Robin (ValiData) - Context Handoff Prompt

**TO THE AI ASSISTANT:**
You are continuing the development of "Project Robin" (rebranded as **ValiData**). This is a professional-grade Data Management & Observability platform built for Snowflake and Databricks.

## 🚀 Current Architecture
- **Frontend**: React (Vite) + TypeScript.
- **Backend**: FastAPI (Python 3.11).
- **Deployment**:
  - **Live Frontend (Vercel)**: `https://vali-data-hcw9962hh-khilesh-s-projects.vercel.app/`
  - **Live Backend (Render)**: `https://validata-backend-u26p.onrender.com/`
  - **Codebase (GitHub)**: `KhileshBris26/ValiData` (Private Repo)

## 🔐 Security & Auth
- **Login System**: Implemented using a SQLite (`users.db`) backend with hashed passwords.
- **Admin Account**: `Khilesh` / `ValiData26`
- **Session**: Protected by `sessionStorage` tokens and a React `ProtectedRoute` wrapper in `App.tsx`.

## 📦 Key Feature Status
1. **Data Catalog**: Dynamic metadata-driven discovery. Fixed the "mock data" glitch; it now pulls real row/attribute counts from Snowflake/Databricks.
2. **Rule Studio**: Cascading dropdowns (Database -> Schema -> Table -> Column) are fully functional.
3. **Lineage Studio**: Dynamic lineage inference engine is implemented. Includes a "Verify" logic that checks data overlap between tables.
4. **AI Agent**: High-fidelity chat interface connected to the backend. Currently uses Snowflake/Databricks LLM capabilities for query generation.

## 🛠️ Essential Local Commands
- **Start Backend**: `venv\Scripts\python.exe -m uvicorn main:app --reload` (Run from root)
- **Start Frontend**: `npm run dev` (Run from `/frontend` folder)
- **Deployment**: `git add .`, `git commit`, `git push` (Vercel & Render auto-redeploy on push)

## 📌 Critical Context
- **Vercel Build Rules**: Vercel is set to strict mode. Any unused imports in TypeScript or type errors in `tsc -b` will block the build. Always clean up imports before pushing.
- **Render Cold Starts**: On the free tier, the backend sleeps. Initial API calls after 15 mins of inactivity may take 30s to respond.
- **Credentials**: Snowflake and Databricks credentials are kept in a local `.env` file. In the cloud, users must enter them manually in the UI (stored in local browser storage).

## 🎯 Next Objectives
1. **AI Agent Smartness**: Move from fixed prompts to a more dynamic agent that can help with custom DQ rule creation based on schema.
2. **Lineage Accuracy**: Continue refining the SQL-based lineage verification to reduce false positives.
3. **Persistent State**: Ensure user-added descriptions and rule "shut-downs" persist across sessions.

**USE THIS INFORMATION TO MAINTAIN CONTINUITY.**
