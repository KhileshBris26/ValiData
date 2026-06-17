# Project Robin - Resumption Notes & Progress Summary

Welcome back! This document outlines all the features implemented, the current state of the application, and the exact steps to resume.

---

## 🏗️ Core Architectural Features Completed

### 1. Unified Data Quality Backend (FastAPI)
- **Zero Data Movement Pattern**: All heavy lifting (profiling, DQ evaluation) runs native via pushdowns in Snowflake/Databricks.
- **Dynamic Rule Management**: AI-driven suggestions and catalog rules are cached locally via sessionStorage and applied dynamically to active tables.
- **Lineage DAG**: Real-time upstream/downstream relationship graph using **React Flow**.

### 2. Premium AI Chatbot Engine (`AIAgent.tsx`)
- **Main Page Context Synchronization**: Auto-detects active tables (e.g., `@BANK_TRANSACTIONS`) so users can ask contextual questions seamlessly.
- **Explainable Workflows**: Prompts render detailed thoughts, intermediate plans, and step-by-step reasoning via the "Show reasoning" and "Show steps" buttons.
- **Auto rule generation & multi-table Review changes**: Clicking `Review changes` allows users to view new rules alongside existing rule instances in their respective tables.
- **Dual Table Management & Sticky Blue Action Banner**: Review changes features two distinct lists (Rule, Rule Instances), and checking any item triggers a vivid blue action bar (`#2563EB`) with clear select & multi-deletion options.

---

## 📑 Screen-Specific Improvements & Interactivity

### 1. Profile and Evaluate View (`DataQualityDetail.tsx`)
- Clicking **"Profile and Evaluate"** triggers an evaluation loading state.
- After completion, the **Overall Data Quality Score** transitions from `39%` to **`82%`**, transforming into a premium green theme.
- Sub-stats update (Passed count, Failed count), and the overall metadata count reflects **`7 applied rules`**.

### 2. Advanced Rule Management (`DataQualityDetail.tsx` & `TableDetail.tsx`)
- Rule badges feature inline buttons within the badge box:
  - **Shutdown Button (`⏻`)**: Clicking the power icon temporarily disables the rule. The rule is visually struck through, has lower opacity, and its status changes to deactivated.
  - **Delete Button (`X`)**: Removes the rule altogether from the attribute table.

---

## 🚀 How to Start & Run Locally

### 🐍 Step 1: Start the Backend (FastAPI)
```powershell
.\venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

### ⚡ Step 2: Start the Frontend (Vite + React)
```powershell
cd frontend
npm run dev
```

The app will be accessible at:
- **Frontend URL**: `http://localhost:5173/`
- **Backend URL**: `http://localhost:8000/`
