import sqlite3
import json
import os
from main import init_db

def run_test():
    db_path = "users.db"
    
    # 1. Insert test data
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute(
        "INSERT INTO rules (platform, database_name, schema_name, table_name, column_name, rule_type, status) "
        "VALUES ('snowflake', 'MY_DB', 'MY_SCHEMA', 'MY_TABLE', 'MY_COL', 'Completeness', 'Active')"
    )
    c.execute(
        "INSERT INTO rule_executions (platform, table_name, column_name, rule_type, total_rows, failed_rows, status) "
        "VALUES ('snowflake', 'MY_TABLE', 'MY_COL', 'Completeness', 100, 0, 'pass')"
    )
    conn.commit()
    conn.close()
    print("1. Inserted test rule and test execution.")
    
    # 2. Run init_db() to simulate server start/reload
    print("2. Simulating server startup/reload (running init_db)...")
    init_db()
    
    # 3. Query the data to verify it persisted and wasn't deleted on startup
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT COUNT(*) as count FROM rules")
    rules_count = c.fetchone()['count']
    c.execute("SELECT COUNT(*) as count FROM rule_executions")
    execs_count = c.fetchone()['count']
    conn.close()
    
    print(f"3. Results after initialization: rules count = {rules_count}, executions count = {execs_count}")
    if rules_count >= 1 and execs_count >= 1:
        print("SUCCESS: Data successfully persisted across backend reloads/initializations!")
    else:
        print("FAILURE: Data was cleared on initialization!")

if __name__ == "__main__":
    run_test()
