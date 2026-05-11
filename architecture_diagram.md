# System Architecture Diagram

This document contains the visual blueprint of our Dual-Platform Data Quality Engine. As we modify our approach or add new components, we will keep this diagram updated.

```mermaid
flowchart TD
    %% Define Styles
    classDef frontend fill:#3498db,stroke:#2980b9,stroke-width:2px,color:#fff
    classDef backend fill:#2ecc71,stroke:#27ae60,stroke-width:2px,color:#fff
    classDef metaDB fill:#9b59b6,stroke:#8e44ad,stroke-width:2px,color:#fff
    classDef clientZone fill:#ecf0f1,stroke:#bdc3c7,stroke-width:2px,stroke-dasharray: 5 5
    classDef snowflake fill:#00a4e4,stroke:#00719c,stroke-width:2px,color:#fff
    classDef databricks fill:#ff3621,stroke:#c82111,stroke-width:2px,color:#fff

    %% Components
    UI["Web Frontend (React/Vue)\nDashboards & Rule Setup"]:::frontend
    
    subgraph ControlPlane["SaaS Control Plane (Your Hosting)"]
        API["FastAPI Backend\n(Orchestrator)"]:::backend
        Translator["Translation Engine\n(SQL/PySpark Generator)"]:::backend
        MetaDB[("Metadata Database\n(Rules, Credentials, Logs)")]:::metaDB
        
        API <--> Translator
        API <--> MetaDB
    end
    
    UI -- "REST/JSON\n(Rule Configs & Aggregated Results)" --> API

    subgraph ClientEnvironments["Client Environments (Zero Data Movement)"]
        subgraph SnowflakeEnv["Snowflake Data Cloud"]
            SF_Compute["Virtual Warehouse\n(Compute)"]:::snowflake
            SF_Cortex["Snowflake Cortex\n(Native LLM)"]:::snowflake
            SF_Data[("Raw Client Data\n(Tables)")]:::snowflake
            
            SF_Compute <--> SF_Data
            SF_Compute <--> SF_Cortex
        end
        
        subgraph DatabricksEnv["Databricks Data Intelligence Platform"]
            DB_Compute["SQL Serverless / Cluster\n(Compute)"]:::databricks
            DB_AI["Databricks AI Functions\n(Native LLM)"]:::databricks
            DB_Data[("Delta Lake\n(Tables)")]:::databricks
            
            DB_Compute <--> DB_Data
            DB_Compute <--> DB_AI
        end
    end

    %% Connections across boundary
    API -- "Executes Native SQL\n(via snowflake-connector)" --> SF_Compute
    SF_Compute -- "Returns Metadata/Counts Only" --> API
    
    API -- "Executes Native SQL/PySpark\n(via databricks-connector)" --> DB_Compute
    DB_Compute -- "Returns Metadata/Counts Only" --> API

```

### Key Architectural Flows:
1. **Rule Creation:** User defines a rule in the **Web Frontend** (e.g., "Check email format"). The **FastAPI Backend** stores this in the **Metadata Database**.
2. **Translation:** When a job runs, the **Translation Engine** converts the abstract rule into dialect-specific code (Snowflake SQL or Databricks SQL).
3. **Pushdown Compute:** The backend sends *only* the query to the target warehouse. The client's **Compute** engine executes it against their **Raw Data**.
4. **Pushdown AI:** If the rule requires AI, the pushed-down query includes calls to **Snowflake Cortex** or **Databricks AI**.
5. **Result Retrieval:** The target warehouse returns *only* the result metrics (e.g., "15 rows failed"), guaranteeing data privacy.
