import os
import snowflake.connector
from snowflake.connector.errors import DatabaseError
from typing import Any, List, Dict
from connectors.base import BaseConnector

class SnowflakeConnector(BaseConnector):
    def __init__(self):
        self.conn = None
        
    def connect(self, credentials: Dict[str, Any] = None) -> None:
        try:
            creds = credentials or {}
            account = creds.get("account") or os.getenv("SNOWFLAKE_ACCOUNT")
            if not account:
                raise ValueError("Missing Snowflake account credentials. Please configure connections first.")

            # Filter out empty strings — Snowflake treats '' differently from None
            warehouse = creds.get("warehouse") or os.getenv("SNOWFLAKE_WAREHOUSE") or None
            if warehouse and warehouse.strip() == '':
                warehouse = None
            database = creds.get("database") or os.getenv("SNOWFLAKE_DATABASE") or None
            if database and database.strip() == '':
                database = None
            schema = creds.get("schema") or os.getenv("SNOWFLAKE_SCHEMA") or None
            if schema and schema.strip() == '':
                schema = None

            self.conn = snowflake.connector.connect(
                account=account,
                user=creds.get("user") or os.getenv("SNOWFLAKE_USER"),
                password=creds.get("password") or os.getenv("SNOWFLAKE_PASSWORD"),
                role=creds.get("role") or os.getenv("SNOWFLAKE_ROLE"),
                warehouse=warehouse,
                database=database,
                schema=schema
            )
            # Explicitly activate warehouse in session if provided, 
            # because some Snowflake roles don't auto-assign a default warehouse
            if warehouse:
                try:
                    self.conn.cursor().execute(f"USE WAREHOUSE {warehouse}")
                except Exception:
                    pass  # If it fails, the connect-level warehouse param may have worked
            print("Successfully connected to Snowflake.")
        except DatabaseError as e:
            print(f"Failed to connect to Snowflake: {e}")
            raise

    def execute_query(self, query: str) -> List[Dict[str, Any]]:
        if not self.conn:
            raise ConnectionError("Not connected to Snowflake. Call connect() first.")
        
        import time
        from app.shared_resources.core.query_logger import log_query
        
        start_time = time.time()
        try:
            # DictCursor returns rows as dictionaries
            with self.conn.cursor(snowflake.connector.DictCursor) as cur:
                cur.execute(query)
                results = cur.fetchall()
                elapsed_ms = int((time.time() - start_time) * 1000)
                log_query("snowflake", query, "SUCCESS", elapsed_ms)
                return results
        except DatabaseError as e:
            elapsed_ms = int((time.time() - start_time) * 1000)
            log_query("snowflake", query, "FAILED", elapsed_ms, str(e))
            print(f"Error executing Snowflake query: {e}")
            raise

    def disconnect(self) -> None:
        if self.conn:
            self.conn.close()
            print("Disconnected from Snowflake.")
