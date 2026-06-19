## This is the test change

# ValiData Component Architecture & System Flow Diagram

This document contains the visual blueprint of ValiData's component-based architecture, detailing layers, interactions, and security boundaries.

---

## 1. Visual Architecture Blueprint

![ValiData Component Architecture Diagram](C:/Users/ASUS/.gemini/antigravity-ide/brain/eaa44295-aab7-4f70-9d14-9e541b8e6e53/validata_architecture_v2_1779983510690.png)

---

## 2. System Architecture Diagram (Mermaid Specification)

```mermaid
flowchart TB
    %% ==========================================
    %% PRESENTATION LAYER (FRONTEND)
    %% ==========================================
    subgraph PresentationLayer["A. Presentation Layer - Frontend React SPA"]
        UI_Login["Login and Auth UI"]
        UI_Platform["Platform Selection UI"]
        UI_Dashboard["Dashboard UI"]
        UI_Rules["Rule Studio UI"]
        UI_Catalog["Data Catalogue UI"]
        UI_Lineage["Lineage Discovery UI"]
        UI_Analytics["Usage and Query Analytics UI"]
        UI_AI["AI Agent Interface"]
    end
    style PresentationLayer fill:#1e293b,stroke:#475569,stroke-width:2px

    %% ==========================================
    %% APPLICATION LAYER (CORE SERVICES)
    %% ==========================================
    subgraph ApplicationLayer["B. Application Layer - Core Services"]
        AuthSvc["Authentication Service"]
        UserSvc["User Management Service"]
        AdminSvc["Admin Approval Service"]
        SessionMgr["Session Manager"]
        RoleResolver["Role Resolver"]
        APIGateway["API Gateway Controller"]
    end
    style ApplicationLayer fill:#1e293b,stroke:#475569,stroke-width:2px

    %% ==========================================
    %% PROCESSING & INTELLIGENCE LAYER
    %% ==========================================
    subgraph ProcessingLayer["C. Processing and Intelligence Layer"]
        DQEngine["Data Quality Rule Engine"]
        ExecEngine["Rule Execution Engine"]
        SchedEngine["Scheduling Engine"]
        ProfileEngine["Profiling Engine"]
        AnomalyEngine["Anomaly Detection Module"]
        LineageEngine["Lineage Extraction Engine"]
        AnalyticsEngine["Query Analytics Processor"]
        AIEngine["AI Agent Engine"]
    end
    style ProcessingLayer fill:#1e293b,stroke:#475569,stroke-width:2px

    %% ==========================================
    %% INTEGRATION LAYER (CONNECTORS)
    %% ==========================================
    subgraph IntegrationLayer["D. Integration Layer"]
        SF_Conn["Snowflake Connector"]
        DB_Conn["Databricks Connector"]
    end
    style IntegrationLayer fill:#1e293b,stroke:#475569,stroke-width:2px

    %% ==========================================
    %% DATA & STORAGE LAYER
    %% ==========================================
    subgraph StorageLayer["E. Data and Storage Layer"]
        DB_Meta[(Metadata Repository)]
        DB_Results[(Rule Results Store)]
        DB_Invalid[(Invalid Records Store)]
        DB_Profile[(Profiling Data Store)]
        DB_Lineage[(Lineage Graph Store)]
        DB_Query[(Query Metrics Store)]
    end
    style StorageLayer fill:#1e1b4b,stroke:#4f46e5,stroke-width:2px

    %% ==========================================
    %% EXTERNAL SYSTEMS
    %% ==========================================
    subgraph ExternalSystems["F. External Systems"]
        SF_Warehouse[(Snowflake Data Cloud)]
        DB_Workspace[(Databricks SQL Workspace)]
    end
    style ExternalSystems fill:#0c4a6e,stroke:#0284c7,stroke-width:2px

    %% ==========================================
    %% KEY INTERACTION FLOW LINES
    %% ==========================================
    
    %% 1. Authentication Flow
    UI_Login --> AuthSvc
    AuthSvc --> SessionMgr
    SessionMgr -.-> UI_Login

    %% 2. User Onboarding Flow
    UI_Platform --> AdminSvc
    AdminSvc --> UserSvc
    UserSvc --> DB_Meta

    %% 3. Role Fetching Flow
    UI_Platform --> RoleResolver
    RoleResolver --> SF_Conn
    SF_Conn --> SF_Warehouse
    SF_Warehouse -->> SF_Conn
    SF_Conn -->> RoleResolver
    RoleResolver -->> UI_Platform

    %% 4. Rule Execution Flow
    UI_Rules --> DQEngine
    DQEngine --> ExecEngine
    ExecEngine --> SF_Conn
    ExecEngine --> DB_Conn
    SF_Conn --> SF_Warehouse
    DB_Conn --> DB_Workspace
    SF_Warehouse -->> SF_Conn
    DB_Workspace -->> DB_Conn
    SF_Conn -->> ExecEngine
    DB_Conn -->> ExecEngine
    ExecEngine --> DB_Results
    ExecEngine --> DB_Invalid
    DB_Results -.-> UI_Dashboard
    DB_Invalid -.-> UI_Dashboard

    %% 5. Data Profiling Flow
    ProfileEngine --> SF_Conn
    ProfileEngine --> DB_Conn
    SF_Conn --> SF_Warehouse
    DB_Conn --> DB_Workspace
    SF_Warehouse -->> SF_Conn
    DB_Workspace -->> DB_Conn
    SF_Conn -->> ProfileEngine
    DB_Conn -->> ProfileEngine
    ProfileEngine --> DB_Profile
    DB_Profile -.-> UI_Catalog

    %% 6. Lineage Flow
    LineageEngine --> SF_Conn
    SF_Conn --> SF_Warehouse
    SF_Warehouse -->> SF_Conn
    SF_Conn -->> LineageEngine
    LineageEngine --> DB_Lineage
    DB_Lineage -.-> UI_Lineage

    %% 7. AI Agent Flow
    UI_AI --> AIEngine
    AIEngine --> DB_Meta
    AIEngine --> DB_Results
    AIEngine -->> UI_AI
```

---

## 3. Component Codebase Cross-Validation

The table below maps the visual components directly to their implementation references inside the workspace:

| Diagram Component | Implementation File / Entry Point | Validation Notes |
| :--- | :--- | :--- |
| **Login / Auth UI** | `frontend/src/pages/LoginPage.tsx` | Implements standard credentials forms & verification flow. |
| **Platform Selection** | `frontend/src/pages/LoginPage.tsx` | Resolves Snowflake or Databricks context on start. |
| **Dashboard UI** | `frontend/src/pages/Dashboard.tsx` | Displays KPIs, anomalies counts, and telemetry. |
| **Rule Studio UI** | `frontend/src/pages/RuleStudio.tsx` & `CreateRule.tsx` | Provides creation interfaces for quality rules. |
| **Data Catalogue UI** | `frontend/src/pages/DataCatalog.tsx` & `TableDetail.tsx` | Allows metadata exploratory browse. |
| **Lineage Discovery UI**| `frontend/src/pages/LineageStudio.tsx` | Visualizes table graphs via React Flow nodes/edges. |
| **AI Agent Interface** | `frontend/src/pages/AIAgent.tsx` | Renders conversational metadata chat bubble forms. |
| **Authentication Service**| `main.py` (`/api/v1/auth/login`) | Handles hashing validation and user credentials context. |
| **Admin Approval Service**| `main.py` (`/api/v1/auth/approve-user`) | Relies on relational DB user approvals state. |
| **Role Resolver** | `main.py` (`/api/v1/auth/fetch-roles`) | Implements dynamic SHOW GRANTS/INFO_SCHEMA handshakes. |
| **Data Quality Engine** | `core/query_generator.py` | Generates pushdown assertions (e.g. Range, Regex). |
| **Lineage Engine** | `core/lineage_engine.py` | Extracts connections by parsing query log details. |
| **Profiling Engine** | `main.py` (`/api/v1/metadata/profile`) | Gathers column profiles (Min, Max, Avg, Nulls). |
| **Scheduling Engine** | `main.py` (`start_scheduler()`) | Spawns background daemon thread checks on rules. |
| **Snowflake Connector** | `connectors/snowflake_connector.py` | Implements connection pools, cursors, and SQL executions. |
| **Databricks Connector** | `connectors/databricks_connector.py` | Uses standard databricks.sql drivers. |
| **Metadata Repository** | Relational DB: `users`, `rules`, `schedules` | Local SQLite or Production Postgres tables. |
| **Anomaly / Profile Store**| Relational DB: `anomalies`, `column_profiles` | Persists rule execution logs and profiles data. |
