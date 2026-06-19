import os
from databricks import sql
from databricks.sql.exc import Error as DatabricksError
from typing import Any, List, Dict
from .base import BaseConnector

class DatabricksConnector(BaseConnector):
    def __init__(self):
        self.conn = None
        
    def connect(self, credentials: Dict[str, Any] = None) -> None:
        try:
            creds = credentials or {}
            server_hostname = creds.get("server_hostname") or os.getenv("DATABRICKS_SERVER_HOSTNAME")
            if not server_hostname:
                raise ValueError("Missing Databricks server hostname. Please configure connections first.")

            self.conn = sql.connect(
                server_hostname=server_hostname,
                http_path=creds.get("http_path") or os.getenv("DATABRICKS_HTTP_PATH"),
                access_token=creds.get("access_token") or os.getenv("DATABRICKS_ACCESS_TOKEN")
            )
            print("Successfully connected to Databricks.")
        except DatabricksError as e:
            print(f"Failed to connect to Databricks: {e}")
            raise

    def execute_query(self, query: str) -> List[Dict[str, Any]]:
        if not self.conn:
            raise ConnectionError("Not connected to Databricks. Call connect() first.")
        
        import time
        from app.shared_resources.core.query_logger import log_query
        
        start_time = time.time()
        try:
            with self.conn.cursor() as cur:
                cur.execute(query)
                columns = [desc[0] for desc in cur.description] if cur.description else []
                results = cur.fetchall() if cur.description else []
                # Convert list of rows to list of dicts to match Snowflake implementation
                dict_results = [dict(zip(columns, row)) for row in results]
                elapsed_ms = int((time.time() - start_time) * 1000)
                log_query("databricks", query, "SUCCESS", elapsed_ms)
                return dict_results
        except DatabricksError as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            log_query("databricks", query, "FAILED", elapsed_ms, str(e))
            print(f"Error executing Databricks query: {e}")
            raise

    def disconnect(self) -> None:
        if self.conn:
            self.conn.close()
            print("Disconnected from Databricks.")
