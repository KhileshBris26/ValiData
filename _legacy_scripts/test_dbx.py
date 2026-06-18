import os
from dotenv import load_dotenv
from databricks import sql

load_dotenv()

hostname = os.getenv("DATABRICKS_SERVER_HOSTNAME")
path = os.getenv("DATABRICKS_HTTP_PATH")
token = os.getenv("DATABRICKS_ACCESS_TOKEN")

print(f"Connecting to Databricks: {hostname}")

try:
    conn = sql.connect(
        server_hostname=hostname,
        http_path=path,
        access_token=token
    )
    print("Success! Running TEST QUERY...")
    cur = conn.cursor()
    query = """
        SELECT statement_text as QUERY_TEXT 
        FROM system.query.history 
        WHERE start_time >= current_timestamp() - interval 7 days
          AND error_message IS NULL
          AND lower(statement_text) LIKE 'select%'
        LIMIT 10
    """
    cur.execute(query)
    rows = cur.fetchall()
    print(f"Found {len(rows)} queries.")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
