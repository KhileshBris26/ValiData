# Phase 8: Automated Lineage & Relationship Discovery

This plan details the architecture for an enterprise-grade Relationship Discovery module. This module will ingest an entire schema, algorithmically infer foreign-key relationships between tables, and render a highly interactive, dbt-style visual DAG (Directed Acyclic Graph).

## Architectural Strategy

### 1. The Inference Engine (Backend)
To prevent crushing the client's warehouse with hundreds of individual `SHOW COLUMNS` queries, we will use bulk metadata extraction.
- **Data Extraction:** We will execute a single, highly optimized query against `INFORMATION_SCHEMA.COLUMNS` (Snowflake) or `system.information_schema.columns` (Databricks) to instantly retrieve every table, column, and data type in the selected schema.
- **Relationship Inference Logic (Python):** 
    - *Heuristics:* We will build a fast algorithm that matches columns based on names (e.g., `customer_id` to `cust_id`) and ensures data type compatibility (e.g., `VARCHAR` to `VARCHAR`).
    - *AI Augmentation (Optional/Future):* We can feed the flattened schema JSON into Snowflake Cortex or Databricks AI to ask it to infer complex, non-obvious relationships based on semantic meaning.
- **Payload Generation:** The endpoint will return a structured JSON response containing `nodes` (the tables) and `edges` (the inferred relationships), heavily inspired by dbt's manifest format.

### 2. The Visualizer (Frontend)
To achieve the premium, interactive experience of dbt Docs or Ataccama, we will use **React Flow** (`reactflow`), the industry-standard library for node-based UIs.
- **Features:** Infinite panning, zooming (mouse wheel), draggable nodes, and minimap.
- **Custom Nodes:** We will design custom glassmorphic "Table" nodes. When a user clicks a node, it will highlight its connected edges (upstream and downstream dependencies).
- **Tabular View:** We will implement a split-view or tabbed interface allowing the user to toggle between the Visual Graph and a traditional Data Grid table listing all detected relationships.

## User Review Required

> [!IMPORTANT]
> **React Flow Installation**
> I will need to run `npm install reactflow` in your frontend directory to implement the interactive node graph. Do I have your approval to install this dependency?

> [!WARNING]
> **Inference Scope for MVP**
> For this phase, I propose building the *Heuristic Engine* (matching names like `user_id` to `id` and `cust_id`, combined with data type validation) completely in Python. Sampling actual data rows (`SELECT *`) across 30 tables to find overlaps is extremely compute-intensive and can cause massive warehouse billing for your clients. Is a pure Metadata-based inference acceptable for this phase?

## Verification Plan
1. Install `reactflow` and build the new `Lineage Studio` page.
2. Build the `INFORMATION_SCHEMA` metadata extractor endpoint.
3. Test the Inference Engine against a schema with known relationships.
4. Verify the React Flow graph renders correctly, allows panning/zooming, and highlights edges on node click.
