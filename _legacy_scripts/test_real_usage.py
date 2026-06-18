import os
import sys
from dotenv import load_dotenv

# Add project root to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.query_generator import QueryGenerator
from connectors.snowflake_connector import SnowflakeConnector
from core.usage_analyzer import UsageAnalyzer

load_dotenv()

print("Testing with real Snowflake queries to debug AST table resolution...")
conn = SnowflakeConnector()
try:
    conn.connect()
    sql = QueryGenerator.generate_query_history_sql("snowflake", 7)
    queries = conn.execute_query(sql)
    print(f"Fetched {len(queries)} queries.")
    
    import sqlglot
    from sqlglot import exp
    
    for row in queries:
        sql = row.get("QUERY_TEXT") or row.get("query_text")
        if not sql or "load_date_ts" not in sql.lower():
            continue
            
        try:
            parsed = sqlglot.parse_one(sql, read=None, error_level="IGNORE")
            if parsed:
                tables = list(parsed.find_all(exp.Table))
                print("\n--- QUERY ---")
                print(sql[:200] + "...")
                print(f"Tables found: {[t.name for t in tables]}")
                for col in parsed.find_all(exp.Column):
                    if "load_date_ts" in col.name.lower():
                        print(f"Col: {col.name}, table_ref: {col.table}")
        except Exception as e:
            pass

        
finally:
    conn.disconnect()
