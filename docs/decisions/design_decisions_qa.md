# Architectural Design Decisions: Q&A

This document serves as a record of the critical decisions made during the design phase of the Dual-Platform Data Quality Engine. It explains the "why" behind our chosen architecture.

### Q: Why are we building an external "Control Plane" app instead of a Native App within Snowflake or Databricks?
**A:** Building natively inside Snowflake (via Native Apps) or Databricks (via Databricks Apps) guarantees ultimate security but restricts the application to that single platform. A Snowflake Native App cannot easily orchestrate a Databricks environment. By building an external "Control Plane" app, we achieve our core requirement: a single, unified codebase that can connect to and manage *both* platforms simultaneously.

### Q: Why do we need a backend app? Why can't this just be a standalone Webpage/UI?
**A:** A frontend webpage (React/Vue) runs in the user's browser. It is fundamentally insecure to store database credentials, connection strings, or complex orchestration logic directly in the browser. Furthermore, a browser cannot efficiently maintain long-running database connections or manage scheduled cron jobs. The frontend must act purely as the user interface, while the backend app securely holds the credentials and orchestrates the heavy lifting.

### Q: Which coding language are we using and why?
**A:** 
*   **Backend:** **Python**. Python is the undisputed lingua franca of data engineering. It offers the best official connection libraries (`snowflake-connector-python`, `databricks-sql-connector`) and the most mature ecosystem for building data translation logic and API backends.
*   **Frontend:** **TypeScript / React** (or Vue). These provide the necessary tools for building dynamic, modern dashboards and interactive rule-building interfaces.

### Q: What is the core Tech Stack?
**A:** 
*   **API Framework:** **FastAPI** (Python). Chosen for its high performance, native async support, and auto-generated API documentation.
*   **Translation Layer:** A Custom Python SQL Builder (or **Ibis** / **SQLGlot**) to translate abstract rules into platform-specific dialects.
*   **Metadata Storage:** **PostgreSQL** (to store user rules, credentials, and run logs securely).
*   **Compute Engines:** The client's own **Snowflake** or **Databricks** environments.

### Q: Which LLM models are we using? Are we integrating with OpenAI?
**A:** We are **not** using external models like OpenAI by default. Instead, we are using the native AI capabilities built directly into the client's data warehouse:
*   **For Snowflake:** `SNOWFLAKE.CORTEX` (which provides models like Mistral and Llama natively).
*   **For Databricks:** Databricks AI Functions / MosaicML.
**Why?** This ensures strict "Zero Data Movement." If we used OpenAI, we would have to send the client's data out over the internet. By using Native AI, the data never leaves their perimeter, and the LLM compute cost is billed directly to the client's standard warehouse bill.

### Q: How do we prevent severe performance issues on large datasets?
**A:** By completely avoiding "Native Python Execution" on the raw data. Our Python app will never pull millions of rows into memory to process them using Pandas or `for` loops. Instead, our app acts as a compiler: it takes a user rule, generates highly optimized native SQL or PySpark, and pushes that code down to the warehouse. The warehouse engine (which is designed for petabyte-scale execution) executes the compiled code.

### Q: How do we guarantee data security and the "Zero Data Movement" promise?
**A:** The platform is designed so that the execution pushdown queries *never* use commands like `SELECT *`. The generated SQL will always return aggregations or metadata. For example, instead of returning the 10,000 rows that failed a null check, the query will return: `{"table": "users", "column": "email", "failed_count": 10000}`. If a data steward needs to see the actual row-level failures, the Web UI will instruct their browser to query their warehouse directly using their own SSO credentials, bypassing our backend entirely.
