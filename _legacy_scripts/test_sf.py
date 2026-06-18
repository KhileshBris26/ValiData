import os
from dotenv import load_dotenv
import snowflake.connector

load_dotenv()

account = os.getenv("SNOWFLAKE_ACCOUNT")
user = os.getenv("SNOWFLAKE_USER")
password = os.getenv("SNOWFLAKE_PASSWORD")

print(f"Connecting to account: {account}, user: {user}")

try:
    conn = snowflake.connector.connect(
        account=account,
        user=user,
        password=password,
        role=os.getenv("SNOWFLAKE_ROLE"),
        warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
        database=os.getenv("SNOWFLAKE_DATABASE"),
        schema=os.getenv("SNOWFLAKE_SCHEMA"),
        login_timeout=10,
        network_timeout=10
    )
    print("Success! Running SHOW DATABASES...")
    cur = conn.cursor()
    cur.execute("SHOW DATABASES;")
    rows = cur.fetchall()
    print(f"Found {len(rows)} databases: {[r[1] for r in rows]}")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
