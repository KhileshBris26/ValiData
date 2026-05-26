import os
import sys
from dotenv import load_dotenv
import snowflake.connector
load_dotenv()

# Simulate exactly what the API does when frontend sends:
# database=UNICORN, schema=PUBLIC, table=ACTOR, column=FIRST_NAME

db = "UNICORN"
schema = "PUBLIC"
table = "ACTOR"
column = "FIRST_NAME"
platform = "snowflake"

# Build the full table ref as the backend does
full_table = f'"{db.upper()}"."{schema.upper()}"."{table.upper()}"'
print(f"Full table ref: {full_table}")

sql = f"""
WITH stats AS (
    SELECT 
        COUNT(*) as total_rows,
        COUNT(DISTINCT {column}) as distinct_count,
        SUM(CASE WHEN {column} IS NULL THEN 1 ELSE 0 END) as null_count,
        CAST(MIN({column}) AS STRING) as min_val,
        CAST(MAX({column}) AS STRING) as max_val,
        CAST(AVG(CASE WHEN TRY_CAST({column} AS FLOAT) IS NOT NULL THEN CAST({column} AS FLOAT) ELSE NULL END) AS STRING) as avg_val
    FROM {full_table}
),
unique_stats AS (
    SELECT COUNT(*) as unique_count
    FROM (
        SELECT {column}
        FROM {full_table}
        WHERE {column} IS NOT NULL
        GROUP BY {column}
        HAVING COUNT(*) = 1
    ) a
),
top_vals AS (
    SELECT CAST({column} AS STRING) as val, COUNT(*) as val_count
    FROM {full_table}
    WHERE {column} IS NOT NULL
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 3
)
SELECT 
    s.*,
    COALESCE(u.unique_count, 0) as unique_count,
    (SELECT LISTAGG(val || ':' || val_count, ',') FROM top_vals) as top_values
FROM stats s
CROSS JOIN unique_stats u
"""

print("SQL to run:\n", sql[:300])

try:
    conn = snowflake.connector.connect(
        account=os.getenv('SNOWFLAKE_ACCOUNT'),
        user=os.getenv('SNOWFLAKE_USER'),
        password=os.getenv('SNOWFLAKE_PASSWORD'),
        role=os.getenv('SNOWFLAKE_ROLE'),
        warehouse=os.getenv('SNOWFLAKE_WAREHOUSE'),
    )
    print("Connected!")

    with conn.cursor(snowflake.connector.DictCursor) as cur:
        cur.execute(sql)
        results = cur.fetchall()
        if results:
            row = results[0]
            print("\n=== RESULT KEYS (case-sensitive) ===")
            for k, v in row.items():
                print(f"  '{k}': {v}")
        else:
            print("EMPTY RESULT")
    conn.close()
except Exception as e:
    print(f"ERROR: {e}")
