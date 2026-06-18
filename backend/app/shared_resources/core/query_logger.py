import os
import sqlite3
import psycopg2
from .context import current_user_var

def log_query(platform: str, query: str, status: str, elapsed_time_ms: int, error_message: str = None):
    """Logs executed query to local database for query history tracking fallback."""
    # Prevent infinite loop or logging internal system tables
    lower_q = query.lower()
    if "system.query.history" in lower_q or "information_schema.query_history" in lower_q or "robin_query_logs" in lower_q:
        return
        
    username = current_user_var.get()
    db_path = "users.db"
    database_url = os.getenv("DATABASE_URL")
    
    conn = None
    try:
        if database_url:
            conn = psycopg2.connect(database_url)
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO robin_query_logs (platform, username, query_text, status, elapsed_time_ms, error_message)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (platform, username, query, status, elapsed_time_ms, error_message))
        else:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO robin_query_logs (platform, username, query_text, status, elapsed_time_ms, error_message)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (platform, username, query, status, elapsed_time_ms, error_message))
        conn.commit()
    except Exception as e:
        print(f"Failed to log query locally: {e}")
    finally:
        if conn:
            conn.close()
