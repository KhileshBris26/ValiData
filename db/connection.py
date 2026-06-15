import os
import base64
import sqlite3
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Import connectors and services
from connectors.snowflake_connector import SnowflakeConnector
from connectors.databricks_connector import DatabricksConnector
from services.snowflake_service import SnowflakeService
from services.databricks_service import DatabricksService

load_dotenv()

DB_PATH = "users.db"
DATABASE_URL = os.getenv("DATABASE_URL")

# Initialize global engines/connectors
snowflake_engine = SnowflakeConnector()
databricks_engine = DatabricksConnector()
snowflake_svc = SnowflakeService(snowflake_engine)
databricks_svc = DatabricksService(databricks_engine)

def get_platform_table(base_name: str, platform: str = None) -> str:
    """Route a generic database table name to its platform-specific version."""
    plat = (platform or "snowflake").lower()
    if plat not in ("snowflake", "databricks"):
        plat = "snowflake"
    return f"{plat}_{base_name}"

def _decrypt_credential(ciphertext: str) -> str:
    """Decrypt a value encrypted by the frontend's mock encryption (reverse + base64)."""
    if not ciphertext:
        return ciphertext
    prefix = "mock_enc_"
    if not ciphertext.startswith(prefix):
        return ciphertext  # not encrypted, return as-is
    try:
        raw = ciphertext[len(prefix):]
        decoded = base64.b64decode(raw).decode("utf-8")
        return decoded[::-1]  # reverse
    except Exception:
        return ciphertext

def get_db_connection():
    if DATABASE_URL:
        # Use PostgreSQL for Cloud (Render/Neon)
        conn = psycopg2.connect(DATABASE_URL)
        return conn, conn.cursor(cursor_factory=RealDictCursor)
    else:
        # Use SQLite for Local
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn, conn.cursor()

def get_saved_credentials(platform: str) -> dict:
    """Fetch the first available saved credentials for *platform* from the users table.
    
    Returns a plain dict suitable for passing to engine.connect(), with
    password / token already decrypted. Falls back to an empty dict if
    nothing is found (which will cause the connector to try env vars).
    """
    import json as _json
    conn, cursor = get_db_connection()
    try:
        # Pick the most-recently-logged-in user who has credentials saved for this platform
        query = (
            "SELECT credentials FROM users WHERE platform = %s AND credentials IS NOT NULL "
            "AND credentials != '' AND status = 'APPROVED' ORDER BY last_login_at DESC LIMIT 1"
        ) if DATABASE_URL else (
            "SELECT credentials FROM users WHERE platform = ? AND credentials IS NOT NULL "
            "AND credentials != '' AND status = 'APPROVED' ORDER BY last_login_at DESC LIMIT 1"
        )
        cursor.execute(query, (platform,))
        row = cursor.fetchone()
        if not row:
            return {}
        raw = row["credentials"] if isinstance(row, dict) else row[0]
        creds = _json.loads(raw) if raw else {}
        if creds.get("password"):
            creds["password"] = _decrypt_credential(creds["password"])
        if creds.get("token"):
            creds["token"] = _decrypt_credential(creds["token"])
        # Remap Databricks credential keys: frontend stores workspace_url/token/cluster_id
        # but the DatabricksConnector expects server_hostname/access_token/http_path
        if platform == "databricks":
            mapped = {}
            mapped["server_hostname"] = creds.get("server_hostname") or creds.get("workspace_url", "")
            mapped["http_path"] = creds.get("http_path") or creds.get("cluster_id", "")
            mapped["access_token"] = creds.get("access_token") or creds.get("token", "")
            creds = mapped
        return creds
    except Exception as exc:
        print(f"get_saved_credentials({platform}) failed: {exc}")
        return {}
    finally:
        conn.close()
