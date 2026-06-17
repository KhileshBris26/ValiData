# ValiData Dashboard Module Documentation

This document provides a comprehensive Q&A-style guide for the Dashboard module of the ValiData intelligence platform. It covers functional aspects, technical integrations, backend logic, and system architecture.

---

## Connected Platforms

Q: What does Connected Platforms show and how is it integrated in code?

Answer:
- From a functional perspective, the Connected Platforms section displays all active data warehouse and database connections for the current user. It visually indicates connection health, platform type (e.g., Snowflake, Databricks), and available schemas.
- Technically, it relies on a connection management service that retrieves user-specific connection parameters securely from an encrypted vault or metadata database. The frontend renders connection cards based on the API response, while the backend tests connectivity periodically.

Additional Details:
- The integration handles Snowflake and Databricks differently. For Snowflake, it uses the official Snowflake Python connector or JDBC driver, validating credentials and roles. For Databricks, it uses the Databricks SQL Connector or REST API using personal access tokens.
- Connection validation logic runs upon user request or login to verify the session and permissions:
  ```sql
  -- Snowflake connection validation queries
  SELECT CURRENT_USER();
  SELECT CURRENT_ROLE();
  ```

---

## Active Rules

Q: What does Active Rules show and how does it fetch real-time information?

Answer:
- Functionally, this section provides an overview of all data quality and governance rules currently enabled and monitoring the connected platforms. It highlights rules by severity, category, and target datasets.
- Technically, the rules engine fetches rule definitions from a central metadata repository. The dashboard differentiates between active (currently executing or scheduled) and inactive rules based on their operational status flags in the database.

Additional Details:
- Rule metadata storage is typically managed in a relational database (like PostgreSQL or MySQL), storing rule logic, thresholds, and scheduling frequency.
- Real-time updates are achieved through WebSockets or server-sent events (SSE). When the rule repository or execution engine updates a rule's status, an event is pushed to the dashboard to refresh the UI immediately without a manual browser reload.

---

## Passed Checks

Q: What does Passed Checks mean and how does it work?

Answer:
- Functionally, Passed Checks indicates the volume and percentage of data records that successfully met the criteria defined in the active rules. It gives users confidence in the overall health and reliability of their datasets.
- Technically, this metric is calculated by the rule execution engine. When a rule evaluates a dataset, it applies conditional logic to each record or aggregate. The system counts the instances where the conditions evaluate to true.

Additional Details:
- Rule execution logic involves compiling user-defined rules into optimized SQL queries or Spark jobs that run natively on the connected platform to minimize data movement and leverage warehouse compute.
- Pass criteria define the acceptable boundaries for data quality (e.g., non-null, within a specific range, matching a regex).
- SQL example for executing the logic:
  ```sql
  -- Counting records that pass a specific quality condition
  SELECT COUNT(*) 
  FROM target_table 
  WHERE condition_is_true;
  ```

---

## Anomalies Detected

Q: What are anomalies detected and what data is shown here?

Answer:
- Functionally, this area surfaces data points that violate established rules or deviate significantly from expected patterns (statistical anomalies). It displays the severity of the issue, the affected table, and a snippet of the problematic data to facilitate quick triage by data stewards.
- Technically, anomalies are recorded as rule violations in an incident management table or quarantine schema. The dashboard queries this table to present aggregate anomaly counts and detailed incident logs.

Additional Details:
- Invalid records are often isolated into quarantine tables or flagged within the source table, allowing teams to review them without affecting downstream analytics.
- Sample datasets of the violating rows are fetched to provide immediate context, usually limited to a small number of rows for performance and security reasons.
- Identifying anomalies utilizes inverted logic:
  ```sql
  -- Selecting records that fail the quality condition
  SELECT * 
  FROM target_table 
  WHERE NOT(condition_is_true)
  LIMIT 100;
  ```

---

## Active Lineage Flow

Q: What does Active Lineage Flow show on dashboard?

Answer:
- Functionally, the Active Lineage Flow provides a visual map of how data moves, transforms, and is consumed across the connected platforms. It allows users to trace the origin of a dataset (upstream) and identify all reports or tables that depend on it (downstream).
- Technically, the lineage graph is constructed by parsing query logs, stored procedures, and view definitions. The frontend utilizes a graph visualization library to render nodes (tables/views) and edges (data transformations).

Additional Details:
- Table dependencies are continuously updated by analyzing the system catalogs and execution histories of the underlying data warehouses.
- For Snowflake integrations, this relies on specific system views to deduce relationships:
  - `SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY` to parse DML statements for dynamic, run-time lineage.
  - `SNOWFLAKE.ACCOUNT_USAGE.OBJECT_DEPENDENCIES` to establish static dependencies between views and underlying tables.

---

## Warehouse Analytics

Q: What comes under Warehouse Analytics?

Answer:
- Functionally, this section offers insights into the operational efficiency and cost of the connected data platforms. Users can monitor compute resource utilization, identify long-running queries, and track overall system load over time.
- Technically, it aggregates telemetry and performance metrics from the data platform's administrative metadata. It presents this time-series data using interactive charts, heatmaps, and top-N lists.

Additional Details:
- Metrics tracked include average query execution time, queued queries, credits/compute hours consumed, and user-level resource usage.
- This relies on querying specific metadata views, particularly in environments like Snowflake:
  - `QUERY_HISTORY` for detailed execution metrics, parsing times, and bytes scanned for individual queries.
  - `WAREHOUSE_LOAD_HISTORY` to monitor the scaling, utilization, and queuing of compute clusters.

---

## Extended Functionality & System Behavior

Q: How does the dashboard personalize per user?

Answer:
- Functionally, the dashboard tailors its view to show only the connections, rules, anomalies, and metrics relevant to the logged-in user's role and assigned projects. A data engineer sees pipeline metrics, while a business user sees domain-specific data health.
- Technically, personalization is driven by a robust Role-Based Access Control (RBAC) system. Upon authentication, the backend fetches the user's permissions and injects authorization context into all subsequent API requests.

Additional Details:
- The backend logic filters database queries returning dashboard data by joining against user permission tables, ensuring users only retrieve metrics for data they are explicitly allowed to access.

---

Q: What happens when no data is available?

Answer:
- Functionally, instead of showing blank screens or errors, the dashboard displays helpful "empty states" (e.g., "No anomalies detected in the last 24 hours" or "Connect a platform to get started"). It guides the user on the next best action.
- Technically, the frontend components check for empty arrays or null responses from the backend APIs. When detected, they conditionally render fallback UI components designed to educate or prompt the user.

Additional Details:
- Empty states are crucial for the onboarding data flow. If a user has no active connections, the API returns a specific payload that triggers an interactive setup wizard rather than the standard metric charts.

---

Q: How real-time is the dashboard?

Answer:
- Functionally, the dashboard balances the need for up-to-date information with platform performance constraints. Critical alerts update instantly, while heavier analytical metrics refresh on a scheduled cadence (e.g., every 15 minutes).
- Technically, it employs a multi-tiered caching and refresh strategy. Event-driven updates (like pipeline failures) are pushed via WebSockets (near real-time), whereas aggregated metrics (like Warehouse Analytics) are queried from a materialized view or in-memory cache updated by background workers.

Additional Details:
- Direct, real-time querying against the operational data warehouse for every dashboard load is avoided to prevent excessive compute costs and latency.
- Data flows from background job schedulers updating cache layers, which the frontend API endpoints then consume for rapid dashboard rendering.

---

Q: How does role-based access affect dashboard metrics?

Answer:
- Functionally, a user's role restricts their visibility into both metadata (which tables they can see) and row-level data (which anomalies they can inspect), ensuring strict data privacy and compliance.
- Technically, the application layer implements object-level filtering and leverages database-native Row-Level Security (RLS) where applicable.

Additional Details:
- The backend validation logic verifies permissions before executing any query against the target data warehouse.
- If a user attempts to view lineage for a restricted table, the graph logic will automatically truncate at the authorized boundary, preventing information leakage about downstream dependencies they are not cleared to view.

---

## Lineage Discovery

Q: How does it get the lineage?

Answer:
- Functionally, Lineage Discovery automatically traces the journey of data from its origin source through various transformations down to the final reporting layer or dashboard.
- Technically, it derives lineage programmatically without requiring manual mapping. It analyzes the underlying data warehouse metadata, specifically looking at how objects reference each other, and parses historical SQL execution logs to capture dynamic data movement (e.g., ETL/ELT pipelines).

Additional Details:
- It combines static dependency analysis (which view relies on which table) with dynamic usage analysis (which query inserted data into a specific target based on a specific source).

---

Q: What components of Snowflake/Databricks does it use?

Answer:
- Functionally, the lineage engine natively integrates with the specific administrative schemas of the connected data warehouse to map relationships.
- Technically, for Snowflake, it heavily utilizes `SNOWFLAKE.ACCOUNT_USAGE.OBJECT_DEPENDENCIES` for structural lineage and parses the SQL text from `SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY` for operational lineage. For Databricks, it relies on Unity Catalog's built-in system tables (like `system.access.table_lineage`) and query history APIs.

Additional Details:
- The backend runs periodic polling jobs against these specific metadata views, incrementally extracting and parsing new execution logs to keep the lineage graph current.

---

Q: Does it show accurate lineage and how to ensure accuracy?

Answer:
- Functionally, it provides a high-confidence representation of data movement, but certain complex programmatic transformations or untracked external processes can introduce blind spots.
- Technically, the accuracy depends heavily on the parsing engine's ability to interpret complex SQL dialects (CTEs, nested subqueries, dynamic SQL). The engine is continuously updated, but inherently complex edge cases may not be parsed perfectly every time.

Additional Details:
- Accuracy improvement strategies include enforcing standardized SQL formatting within the data engineering team, avoiding overly obfuscated dynamic SQL where possible, and regularly auditing the parsed lineage against known ETL logic to flag parser improvements.
- Limitations often arise around specific column-level lineage challenges when complex string manipulation or pivot/unpivot operations obscure the direct relationship between source and target columns.

---

Q: How to see upstream and downstream column usage?

Answer:
- Functionally, users can click on a specific column within the Lineage Discovery interface to highlight its specific path. Upstream shows where the column's data originated, while downstream highlights which derived tables or views consume this specific column.
- Technically, the system utilizes an abstract syntax tree (AST) parser to break down the SQL statements found in the query history. By analyzing the `SELECT` and `INSERT`/`UPDATE` clauses at the token level, it maps individual source columns to their respective target columns.

Additional Details:
- This column-level granularity requires intense computational parsing of the query text, tracking aliases and aggregate functions to trace the lineage accurately through intermediate transformation steps.

---

Q: What are its capabilities?

Answer:
- Functionally, Lineage Discovery empowers root-cause analysis (when a dashboard breaks, trace back to the failing source), impact analysis (if I drop this column, what breaks downstream?), and compliance auditing (proving the provenance of financial or sensitive data).
- Technically, it features interactive graph visualizations, search/filtering by object type, historical snapshots of lineage, and API endpoints to export lineage metadata to external catalogs.

Additional Details:
- The capability to perform cross-platform lineage (e.g., tracing from an S3 bucket tracked in Databricks through to a Snowflake presentation layer) is a core focus, requiring the correlation of metadata across distinct platform connections.

---

Q: What is tabular data?

Answer:
- Functionally, in the context of the platform, tabular data refers to the structured datasets (tables, views, materialized views) that the Lineage Discovery engine tracks and connects.
- Technically, tabular data consists of records organized in a grid of rows and columns, strictly typed and defined by a schema. It represents the primary entity type represented as a "node" within the lineage graph visualization.

Additional Details:
- The engine focuses on tracking the movement of these tabular structures, distinguishing them from unstructured data (like raw JSON or text files) that might exist upstream before being parsed into a tabular format within the warehouse.

---

Q: How is the lineage graph built and how are transformations interpreted?

Answer:
- Functionally, the lineage graph is dynamically generated to provide a user-friendly, interactive topology of the data ecosystem. It visually represents how raw data is sculpted into analytical models.
- Technically, the backend constructs a directed acyclic graph (DAG) where nodes represent data objects (tables/views) and directed edges represent the data flow. Transformations are interpreted by analyzing the AST of the SQL queries; operations like `JOIN`, `GROUP BY`, and `CASE` statements are mapped as specific attributes or "transformation nodes" on the edges connecting the source and target.

Additional Details:
- The graph building process involves:
  1. Extracting raw query history and object dependencies.
  2. Parsing SQL text using a dedicated SQL parser to generate the AST.
  3. Traversing the AST to extract node and edge relationships.
  4. Storing these relationships in a graph database or an optimized relational schema for rapid traversal.
  5. The frontend rendering this topology using a library like React Flow, applying layout algorithms to optimize readability.

---

## Rule Studio

Q: What is the use of Rule Studio?

Answer:
- Functionally, Rule Studio is the centralized interface within ValiData where data stewards and engineers author, test, and deploy data quality and governance rules. It provides a visual builder for defining logic without writing raw SQL.
- Technically, it acts as the frontend client for the rule management API. It translates user-selected conditions (e.g., "column X must be greater than Y") into a standardized JSON schema, which the backend then compiles into target-specific executable code (SQL or Spark).

Additional Details:
- It eliminates the need for disparate, hardcoded validation scripts scattered across different repositories by centralizing rule definition and versioning.

---

Q: What are practical scenarios where it can be used?

Answer:
- Functionally, it is used to ensure data reliability before downstream consumption. Scenarios include verifying that a user's age is greater than 0, checking that email formats are valid, ensuring no null values in primary keys, or validating that transaction amounts fall within historical thresholds.
- Technically, these scenarios map to different classes of data quality rules: completeness (null checks), validity (regex matching), accuracy (range checks), and uniqueness (duplicate detection).

Additional Details:
- A practical workflow: A data engineer ingests a new customer table. They use Rule Studio to define a "Completeness" rule on the `customer_id` column. If the rule fails, an alert is triggered before the data reaches the marketing dashboard.

---

Q: What are its capabilities?

Answer:
- Functionally, Rule Studio supports creating custom rules from scratch, selecting from pre-configured rule templates, testing rules interactively against a sample dataset, and defining the severity of rule violations (Warning, Error, Critical).
- Technically, it features a dynamic UI that fetches available schemas and columns directly from the connected warehouse. It supports building complex boolean logic (AND/OR groups) and maintains a history of rule modifications (audit trail).

Additional Details:
- The capability to run an ad-hoc "Test execution" allows users to validate their rule logic against live data before officially scheduling it, preventing poorly authored rules from causing unnecessary alerts.

---

Q: Can we apply multiple rules to multiple columns?

Answer:
- Functionally, yes. Users can create a single "Rule Suite" or policy that encapsulates numerous distinct checks across different columns within the same table.
- Technically, the Rule Studio allows the construction of multi-condition rule objects. The backend compiler optimizes these into a unified execution plan, often scanning the table only once to evaluate multiple column-level rules simultaneously to reduce warehouse compute costs.

Additional Details:
- Example: A single Rule Suite could contain Rule A (checking `email` validity) and Rule B (checking `age` > 18).

---

Q: Can we schedule checks?

Answer:
- Functionally, yes. Rule Studio includes a scheduling module where users can define how frequently a rule or rule suite should run (e.g., hourly, daily, after a specific ETL job finishes).
- Technically, the scheduler translates user inputs into CRON expressions. The backend utilizes a job orchestration tool to trigger the rule execution engine at the specified intervals.

Additional Details:
- Scheduling can also be event-driven via webhooks, triggering rule checks immediately after an upstream pipeline completes.

---

Q: Can we get downloadable results?

Answer:
- Functionally, yes. After a rule executes, the results (including metadata about the run and snippets of the invalid data) can be exported for offline analysis or sharing.
- Technically, the backend provides an export API that queries the results repository and streams the payload back to the client as a formatted CSV, Excel, or JSON file.

Additional Details:
- Downloadable results are crucial for sharing specific data quality incidents with external teams who may not have direct access to the ValiData dashboard.

---

### Advanced Operations

Q: How are rules executed technically?

Answer:
- Functionally, rules are executed seamlessly in the background against the target data platform without moving the data out of the warehouse.
- Technically, the Execution Flow is as follows:
  1. The scheduler or user triggers a rule.
  2. The backend fetches the rule's JSON schema from the database.
  3. A translation layer compiles the JSON schema into native SQL optimized for the specific data warehouse (Snowflake/Databricks).
  4. The query is executed via the established connection.
  5. The backend parses the query results (pass/fail counts, anomalies) and persists them.

Additional Details:
- **Rule Structure Schema:** Rules are typically stored in a structured JSON format:
  ```json
  {
    "rule_id": "12345",
    "target_table": "sales.transactions",
    "column": "amount",
    "condition": "greater_than",
    "threshold": 0
  }
  ```
- **SQL Example (Compiled execution):**
  ```sql
  -- Compiled from the schema above
  SELECT COUNT(*) as failed_records
  FROM sales.transactions
  WHERE NOT (amount > 0);
  ```

---

Q: How are invalid records stored?

Answer:
- Functionally, records that violate the rules are captured so data stewards can review and remediate the exact rows causing the issue.
- Technically, the execution engine generates a secondary query that `SELECT`s the failing rows. These rows are either inserted into a dedicated "quarantine" schema within the target warehouse or a sample is serialized and stored in ValiData's internal incident management database.

Additional Details:
- Storing full quarantine tables inside the target warehouse is preferred for security and scalability, avoiding the egress of large volumes of sensitive invalid data.

---

Q: How does role-based execution work in Snowflake?

Answer:
- Functionally, rules are executed with the specific permissions of the user who authored or scheduled them, ensuring they cannot validate data they are not allowed to see.
- Technically, the backend leverages Snowflake's `USE ROLE` command or initiates the connection session using the specific user's OAuth token or assigned service account role.

Additional Details:
- Before executing the compiled rule query, the system explicitly sets the context:
  ```sql
  USE ROLE data_steward_role;
  USE WAREHOUSE compute_wh;
  -- Proceed with rule execution query
  ```

---

Q: What happens when a rule fails?

Answer:
- Functionally, a rule failure triggers the incident management workflow. Alerts are dispatched to the subscribed users, and the rule's status on the dashboard turns red.
- Technically, the backend evaluates the result payload against the rule's defined threshold (e.g., if `failed_records > 0`). If the condition is met, an event is published to an internal message broker. Alerting workers consume this event and dispatch notifications.

Additional Details:
- The system can also be configured to trigger "circuit breakers," automatically pausing downstream ETL pipelines via webhooks if critical data quality rules fail.

---

Q: How are results persisted?

Answer:
- Functionally, historical rule execution results are saved to track data quality trends over time and generate compliance reports.
- Technically, the aggregated metrics (total rows evaluated, rows passed, rows failed, execution duration) are inserted into a relational database. This forms the time-series data powering the Dashboard's historical charts.

Additional Details:
- The persistence layer is designed for high-volume writes, as an enterprise deployment may execute thousands of rule checks per hour. The schema is optimized for rapid time-based querying.

---

## Data Catalogue

Q: What is the Data Trust Index and Overall Quality?

Answer:
- Functionally, the Data Trust Index (DTI) is a high-level composite score (typically 0-100) that tells business users how reliable a specific dataset is at a glance. Overall Quality is a similar aggregated metric representing the combined pass rate of all applied rules on that dataset.
- Technically, DTI is a weighted average of underlying Data Quality Dimensions (like Accuracy, Validity, Completeness) combined with metadata factors like Freshness and Stewardship assignment.

Additional Details:
- The DTI calculation engine runs nightly or post-ETL, aggregating the latest rule execution results and metadata updates into a single score stored in the catalogue's materialized view.

---

Q: How is Data Freshness tracked and calculated?

Answer:
- Functionally, Data Freshness indicates how recently the data was updated, helping users understand if they are querying stale information.
- Technically, the catalogue calculates freshness by polling the data warehouse's information schema (e.g., `LAST_ALTERED` timestamp) or by querying the maximum value of a user-defined watermark column (e.g., `updated_at`).

Additional Details:
- **Logical Calculation:** 
  `Freshness = Current_Timestamp - MAX(updated_at_column)`
  If the delta exceeds a predefined SLA threshold (e.g., 24 hours), the dataset is flagged as "Stale."

---

Q: What roles do Governance and Stewardship play in the catalogue?

Answer:
- Functionally, Governance provides context—business glossaries, data classifications (PII, Financial), and usage policies. Stewardship assigns human accountability, listing the "Data Owner" or "Data Steward" directly on the dataset profile.
- Technically, the catalogue maintains a metadata mapping schema that links user UUIDs (stewards) and governance tags (e.g., `#PII`) to specific table or column object IDs.

Additional Details:
- If a dataset's Quality Score drops, the assigned Steward receives an automated alert, streamlining the incident resolution process.

---

Q: What are DQ Dimensions (Accuracy, Validity) and how are they calculated?

Answer:
- Functionally, Data Quality Dimensions break down the overall score into specific categories. Validity ensures data formats are correct (e.g., email format), while Accuracy ensures the data reflects reality (e.g., age > 0 and < 120).
- Technically, these are calculated based on the aggregate pass/fail rates of specific rules categorized under each dimension.

Additional Details:
- **Logical Calculation for Validity:**
  `Validity Score (%) = (Total Records - Count of Records Failing Regex/Format Rules) / Total Records * 100`
- **Logical Calculation for Accuracy:**
  `Accuracy Score (%) = (Total Records - Count of Records Failing Range/Logic Rules) / Total Records * 100`

---

Q: What are Profiling details and how are Top values calculated?

Answer:
- Functionally, Profiling provides a statistical summary of a column (min, max, mean, null count, distinct count) to help users understand the shape of the data. Top Values show the most frequent entries, aiding in anomaly detection.
- Technically, profiling executes aggregate SQL queries against the dataset. Top values are calculated using `COUNT` and `GROUP BY`, ordered descending with a `LIMIT`.

Additional Details:
- **SQL Example for Top Values:**
  ```sql
  SELECT column_name, COUNT(*) as frequency 
  FROM table_name 
  GROUP BY column_name 
  ORDER BY frequency DESC 
  LIMIT 10;
  ```

---

Q: What is the difference between Applied rules and Suggested rules?

Answer:
- Functionally, Applied Rules are the active checks currently monitoring the dataset. Suggested Rules are automated recommendations generated by the platform to improve coverage based on data profiling.
- Technically, Applied Rules are fetched from the active rule registry. Suggested Rules are generated by an ML model or heuristic engine that analyzes profiling metadata (e.g., if a column has 99% unique values, it suggests a "Primary Key" rule).

Additional Details:
- Users can review Suggested Rules in the catalogue and promote them to Applied Rules with a single click.

---

Q: How does the Execution summary and Invalid record samples work?

Answer:
- Functionally, the Execution Summary provides a historical log of when rules ran and their pass/fail status. Invalid Record Samples display actual rows that failed rules, allowing stewards to debug issues.
- Technically, the summary queries the time-series results database. For samples, the catalogue engine fetches the serialized failed records stored during rule execution (or queries the warehouse's quarantine table).

Additional Details:
- Invalid record access is strictly governed by RBAC to prevent unauthorized exposure of sensitive PII data that failed a validation check.

---

Q: How does Scheduling, History & transformations, and Lineage integration work in the catalogue?

Answer:
- Functionally, the catalogue is a one-stop-shop. It shows when the next quality check is scheduled, the historical schema transformations (e.g., "column added yesterday"), and integrates directly with the Lineage graph to show upstream/downstream impacts.
- Technically, the catalogue API federates data from multiple microservices: the job scheduler API for next runs, the metadata crawler logs for schema history, and the graph database for the lineage visualization component.

Additional Details:
- If a user spots a severe drop in the Data Trust Index, they can seamlessly click into the Lineage Integration view to identify if an upstream transformation failure caused the issue.

---

### Advanced Architecture

Q: How does profiling work internally and what sampling techniques are used?

Answer:
- Functionally, profiling large datasets can be slow and expensive. The system must balance statistical accuracy with compute cost.
- Technically, the profiling engine pushes aggregate computations down to the native warehouse (e.g., Snowflake). To optimize performance on massive tables, it employs Reservoir Sampling or native warehouse sampling functions (like `TABLE(SAMPLE(10 PERCENT))`).

Additional Details:
- For multi-billion row tables, exact distinct counts (`COUNT(DISTINCT)`) are extremely expensive. The engine automatically degrades to probabilistic data structures like HyperLogLog (`APPROX_COUNT_DISTINCT`) to maintain performance while delivering near-exact cardinality estimations.

---

Q: What are the performance considerations and metadata storage design?

Answer:
- Functionally, the catalogue must render instantly, even if the underlying data warehouse contains millions of tables and columns.
- Technically, direct querying of warehouse `INFORMATION_SCHEMA` for user searches is too slow. Therefore, metadata is asynchronously crawled and indexed into a dedicated, fast-retrieval datastore.

Additional Details:
- **Metadata Storage Design:** The system typically uses an architecture where deeply relational data (user permissions, rule configs) lives in PostgreSQL, while the searchable catalogue index (descriptions, tags, column names) is synchronized to a search engine like Elasticsearch or OpenSearch. This allows for sub-second, full-text search across the entire data estate, decoupled from the warehouse's compute availability.

---

## Usage & Query Analytics

Q: What does Usage and Query Analytics do?

Answer:
- Functionally, it provides visibility into how the data warehouse is being utilized. It tracks which queries are running, who is running them, and how much compute resources they are consuming.
- Technically, it is an observability module that aggregates telemetry data from the warehouse's administrative metadata layer into human-readable charts and metrics.

Additional Details:
- It acts as a FinOps tool, allowing administrators to correlate specific workloads (like heavy transformation pipelines) with actual compute costs.

---

Q: How does it help?

Answer:
- Functionally, it helps administrators identify performance bottlenecks, optimize expensive queries, allocate costs back to specific business units, and detect unauthorized or unusually heavy data extraction attempts.
- Technically, it enables proactive capacity planning by highlighting trends in compute utilization (e.g., "Warehouse X hits 100% load every morning at 9 AM").

Additional Details:
- By identifying long-running or frequently failing queries, engineering teams can prioritize performance tuning and refactoring.

---

Q: What does it show?

Answer:
- Functionally, it displays dashboards covering total execution times, queued query times, top most expensive queries, credits consumed by user/role, and historical warehouse load patterns.
- Technically, it visualizes time-series aggregations, such as the 95th percentile of query latency or the sum of bytes scanned per hour across different compute clusters.

Additional Details:
- The UI often includes a "Top 10 Expensive Queries" list with a drill-down into the actual SQL text and execution plan.

---

Q: How does it retrieve information?

Answer:
- Functionally, it polls the connected data platform securely, extracting metadata without accessing the actual business data stored in the tables.
- Technically, it relies heavily on system views like Snowflake's `ACCOUNT_USAGE` schema. Specifically, it parses `QUERY_HISTORY` for detailed query-level telemetry, `WAREHOUSE_LOAD_HISTORY` for compute cluster utilization, and `METERING_HISTORY` for billing metrics.

Additional Details:
- The backend utilizes advanced query parsing on the extracted SQL text from `QUERY_HISTORY` to categorize queries by type (SELECT, INSERT, COPY) and attribute them to specific applications or ETL tools.

---

## AI Agent

Q: How does it work?

Answer:
- Functionally, the AI Agent acts as a natural language co-pilot for data stewards. Users can ask questions like "Why did the sales table fail quality checks today?" and receive contextual, data-driven answers.
- Technically, it utilizes a Retrieval-Augmented Generation (RAG) architecture. When a user asks a question, the system first retrieves relevant context (e.g., recent rule execution logs, metadata, error messages) from the platform's database, then feeds this context along with the user's prompt to the LLM to generate an informed response.

Additional Details:
- This reasoning architecture ensures the AI grounds its answers in the actual state of the user's data warehouse, reducing hallucinations.

---

Q: What LLM does it use?

Answer:
- Functionally, the platform integrates with state-of-the-art Large Language Models capable of understanding complex data engineering and analytical concepts.
- Technically, it can be configured to use commercial models via API (like OpenAI's GPT-4, Anthropic's Claude, or Google's Gemini) or, for strict data residency requirements, open-weights models (like Llama 3) hosted securely within the enterprise's private cloud.

Additional Details:
- The abstraction layer allows the platform to swap underlying foundation models as newer, more capable versions are released without rewriting the core agent logic.

---

Q: What capabilities does it have?

Answer:
- Functionally, it can explain complex SQL errors, suggest data quality rules based on table profiles, summarize lineage graphs, and generate draft SQL for data transformations.
- Technically, its capabilities are defined by the "tools" exposed to it. Through function calling, the LLM can query the internal metadata catalog, trigger a profile run, or search the documentation repository to augment its answers.

Additional Details:
- It can translate a business requirement ("Make sure no products have negative prices") into a structured JSON rule schema ready for deployment in the Rule Studio.

---

Q: Can it alter DQ rules?

Answer:
- Functionally, the AI Agent can draft, recommend, and configure data quality rules, but it cannot unilaterally deploy or alter them without human review.
- Technically, the agent operates under a "human-in-the-loop" constraint. When it generates a rule modification, it creates a draft object. A user with appropriate RBAC permissions must explicitly approve and commit the change before it becomes active in the execution engine.

Additional Details:
- This prevents the AI from accidentally modifying critical validation pipelines or relaxing constraints on sensitive data.

---

## Platform Architecture

Q: Where is data stored (invalid records, profiling, etc.)?

Answer:
- Functionally, ValiData respects data sovereignty. Metadata and configuration are stored within the platform, while sensitive business data remains in the customer's warehouse.
- Technically, the data storage layers are strictly segregated:
  1. **Application Data:** Rule definitions, user configurations, RBAC policies, and aggregated metadata (DTI scores) are stored in the platform's primary relational database (e.g., PostgreSQL).
  2. **Search Index:** Indexed metadata for the Data Catalogue resides in a search engine like Elasticsearch.
  3. **Business Data & Anomalies:** Profiling executes natively in the target warehouse (e.g., Snowflake). Invalid records detected during rule execution are either inserted into a dedicated quarantine schema *within the customer's warehouse* or heavily obfuscated/sampled before being serialized to the platform's incident database.

Additional Details:
- This "push-down" architecture ensures the platform minimizes data egress, keeping compute costs localized and maximizing security.

---

Q: Where is the app hosted?

Answer:
- Functionally, it is accessible via a web browser, deployed either as a managed SaaS solution or hosted within the customer's private cloud infrastructure.
- Technically, the hosting architecture consists of a decoupled frontend and backend:
  - **Frontend:** A Single Page Application (SPA) built with React or similar frameworks, hosted on a CDN or cloud storage bucket (e.g., AWS S3/CloudFront) for rapid global delivery.
  - **Backend:** Containerized microservices (e.g., Docker/Kubernetes) written in Python (FastAPI) or Node.js. These services handle API requests, job orchestration, and interaction with the AI Agent.

Additional Details:
- The backend utilizes an asynchronous worker model (like Celery + Redis) to handle long-running tasks like massive query history parsing or lineage graph generation without blocking the main web API.

---

### Advanced Architecture

Q: What are the security considerations?

Answer:
- Functionally, the platform must guarantee that sensitive data is never exposed and that users only see what they are authorized to see.
- Technically, security is enforced via end-to-end encryption (TLS in transit, AES-256 at rest), strict OAuth/SAML integration for SSO, and fine-grained Role-Based Access Control (RBAC). The backend never stores plaintext warehouse credentials; they are kept in a secure Key Management Service (KMS) or secret vault.

Additional Details:
- All queries executed against the target warehouse are routed through a secure, audited gateway that enforces the user's specific role constraints (e.g., `USE ROLE` in Snowflake) before execution.

---

Q: What is the scaling model?

Answer:
- Functionally, the platform must seamlessly handle an increasing volume of tables, rules, and concurrent users without degrading performance.
- Technically, it employs horizontal scaling. The containerized backend API and worker nodes can automatically scale out using Kubernetes Horizontal Pod Autoscalers (HPA) based on CPU/Memory load or the size of the job queue.

Additional Details:
- The database tier utilizes read replicas to distribute the load of heavy analytical queries from the dashboard, ensuring the primary database remains responsive for writes.

---

Q: How is multi-user isolation achieved?

Answer:
- Functionally, in a multi-tenant SaaS deployment, Customer A must never be able to access Customer B's rules, connections, or metadata.
- Technically, multi-user isolation is implemented at multiple levels. At the application layer, every API request is validated against a tenant ID. At the database layer, Row-Level Security (RLS) policies ensure that queries implicitly filter by `tenant_id`, preventing cross-tenant data leakage even in the event of an application logic flaw.

Additional Details:
- For enterprises requiring absolute isolation, the architecture supports a Single-Tenant deployment model, provisioning entirely dedicated databases, workers, and API instances within an isolated Virtual Private Cloud (VPC).
