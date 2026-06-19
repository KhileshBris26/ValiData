import hashlib
from app.shared_resources.database.connection import get_db_connection, DATABASE_URL

def init_db():
    conn, cursor = get_db_connection()
    try:
        if DATABASE_URL:
            # PostgreSQL syntax
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT UNIQUE,
                    full_name TEXT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE,
                    password_hash TEXT NOT NULL,
                    status TEXT DEFAULT 'PENDING',
                    platform TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    approved_at TIMESTAMP,
                    approved_by TEXT,
                    revoked_at TIMESTAMP,
                    last_login_at TIMESTAMP,
                    roles TEXT,
                    credentials TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS rules (
                    id SERIAL PRIMARY KEY,
                    platform TEXT,
                    database_name TEXT,
                    schema_name TEXT,
                    table_name TEXT,
                    column_name TEXT,
                    rule_type TEXT,
                    rule_params TEXT,
                    status TEXT DEFAULT 'Active',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS rule_executions (
                    id SERIAL PRIMARY KEY,
                    platform TEXT,
                    table_name TEXT,
                    column_name TEXT,
                    rule_type TEXT,
                    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    total_rows INTEGER,
                    failed_rows INTEGER,
                    status TEXT,
                    error_message TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS anomalies (
                    id SERIAL PRIMARY KEY,
                    title TEXT,
                    msg TEXT,
                    type TEXT,
                    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'Active'
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS dq_run_history (
                    id SERIAL PRIMARY KEY,
                    table_name TEXT NOT NULL,
                    run_date TEXT NOT NULL,
                    run_time TEXT NOT NULL,
                    dq_score REAL NOT NULL,
                    total_rows INTEGER NOT NULL,
                    passed_rows INTEGER NOT NULL,
                    failed_rows INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    executed_by TEXT DEFAULT 'User',
                    duration_ms INTEGER DEFAULT 0,
                    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS schedules (
                    id SERIAL PRIMARY KEY,
                    platform TEXT,
                    database_name TEXT,
                    schema_name TEXT,
                    table_name TEXT,
                    run_type TEXT,
                    frequency TEXT,
                    custom_config TEXT,
                    start_time TEXT,
                    timezone TEXT,
                    status TEXT DEFAULT 'Active',
                    last_run_time TEXT,
                    next_run_time TEXT,
                    enabled INTEGER DEFAULT 0,
                    last_error TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS column_profiles (
                    platform TEXT,
                    database_name TEXT,
                    schema_name TEXT,
                    table_name TEXT,
                    profile_data TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (platform, database_name, schema_name, table_name)
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS dq_role_fetch_logs (
                    id SERIAL PRIMARY KEY,
                    user_name TEXT,
                    query_executed TEXT,
                    roles_returned TEXT,
                    status TEXT,
                    error_message TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS dq_rule_generation_logs (
                    id SERIAL PRIMARY KEY,
                    request_id TEXT,
                    table_name TEXT,
                    columns_selected TEXT,
                    rules_generated INTEGER,
                    generation_type TEXT,
                    status TEXT,
                    error_message TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS data_catalog_metadata (
                    platform TEXT,
                    database_name TEXT,
                    schema_name TEXT,
                    table_name TEXT,
                    column_name TEXT,
                    description TEXT,
                    terms TEXT,
                    is_auto_generated BOOLEAN DEFAULT FALSE,
                    is_locked BOOLEAN DEFAULT FALSE,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_by TEXT,
                    PRIMARY KEY (platform, database_name, schema_name, table_name, column_name)
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS metadata_audit_log (
                    id SERIAL PRIMARY KEY,
                    platform TEXT,
                    table_name TEXT,
                    action TEXT,
                    old_value TEXT,
                    new_value TEXT,
                    user_name TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS robin_query_logs (
                    id SERIAL PRIMARY KEY,
                    platform TEXT NOT NULL,
                    username TEXT NOT NULL,
                    query_text TEXT NOT NULL,
                    status TEXT DEFAULT 'SUCCESS',
                    elapsed_time_ms INTEGER DEFAULT 0,
                    error_message TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Create Snowflake and Databricks specific tables for PostgreSQL
            for plat in ["snowflake", "databricks"]:
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {plat}_rules (
                        id SERIAL PRIMARY KEY,
                        platform TEXT,
                        database_name TEXT,
                        schema_name TEXT,
                        table_name TEXT,
                        column_name TEXT,
                        rule_type TEXT,
                        rule_params TEXT,
                        status TEXT DEFAULT 'Active',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {plat}_rule_executions (
                        id SERIAL PRIMARY KEY,
                        platform TEXT,
                        table_name TEXT,
                        column_name TEXT,
                        rule_type TEXT,
                        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        total_rows INTEGER,
                        failed_rows INTEGER,
                        status TEXT,
                        error_message TEXT
                    )
                """)
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {plat}_anomalies (
                        id SERIAL PRIMARY KEY,
                        title TEXT,
                        msg TEXT,
                        type TEXT,
                        platform TEXT,
                        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        status TEXT DEFAULT 'Active'
                    )
                """)
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {plat}_dq_run_history (
                        id SERIAL PRIMARY KEY,
                        platform TEXT,
                        table_name TEXT NOT NULL,
                        run_date TEXT NOT NULL,
                        run_time TEXT NOT NULL,
                        dq_score REAL NOT NULL,
                        total_rows INTEGER NOT NULL,
                        passed_rows INTEGER NOT NULL,
                        failed_rows INTEGER NOT NULL,
                        status TEXT NOT NULL,
                        executed_by TEXT DEFAULT 'User',
                        duration_ms INTEGER DEFAULT 0,
                        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {plat}_column_profiles (
                        platform TEXT,
                        database_name TEXT,
                        schema_name TEXT,
                        table_name TEXT,
                        profile_data TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (platform, database_name, schema_name, table_name)
                    )
                """)
        else:
            # SQLite syntax
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT UNIQUE,
                    full_name TEXT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE,
                    password_hash TEXT NOT NULL,
                    status TEXT DEFAULT 'PENDING',
                    platform TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    approved_at TIMESTAMP,
                    approved_by TEXT,
                    revoked_at TIMESTAMP,
                    last_login_at TIMESTAMP,
                    roles TEXT,
                    credentials TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS dq_role_fetch_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_name TEXT,
                    query_executed TEXT,
                    roles_returned TEXT,
                    status TEXT,
                    error_message TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS dq_rule_generation_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT,
                    table_name TEXT,
                    columns_selected TEXT,
                    rules_generated INTEGER,
                    generation_type TEXT,
                    status TEXT,
                    error_message TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS data_catalog_metadata (
                    platform TEXT,
                    database_name TEXT,
                    schema_name TEXT,
                    table_name TEXT,
                    column_name TEXT,
                    description TEXT,
                    terms TEXT,
                    is_auto_generated BOOLEAN DEFAULT FALSE,
                    is_locked BOOLEAN DEFAULT FALSE,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_by TEXT,
                    PRIMARY KEY (platform, database_name, schema_name, table_name, column_name)
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS metadata_audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT,
                    table_name TEXT,
                    action TEXT,
                    old_value TEXT,
                    new_value TEXT,
                    user_name TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS robin_query_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT NOT NULL,
                    username TEXT NOT NULL,
                    query_text TEXT NOT NULL,
                    status TEXT DEFAULT 'SUCCESS',
                    elapsed_time_ms INTEGER DEFAULT 0,
                    error_message TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT,
                    database_name TEXT,
                    schema_name TEXT,
                    table_name TEXT,
                    column_name TEXT,
                    rule_type TEXT,
                    rule_params TEXT,
                    status TEXT DEFAULT 'Active',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS rule_executions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT,
                    table_name TEXT,
                    column_name TEXT,
                    rule_type TEXT,
                    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    total_rows INTEGER,
                    failed_rows INTEGER,
                    status TEXT,
                    error_message TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS anomalies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT,
                    msg TEXT,
                    type TEXT,
                    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'Active'
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS dq_run_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    table_name TEXT NOT NULL,
                    run_date TEXT NOT NULL,
                    run_time TEXT NOT NULL,
                    dq_score REAL NOT NULL,
                    total_rows INTEGER NOT NULL,
                    passed_rows INTEGER NOT NULL,
                    failed_rows INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    executed_by TEXT DEFAULT 'User',
                    duration_ms INTEGER DEFAULT 0,
                    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS schedules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT,
                    database_name TEXT,
                    schema_name TEXT,
                    table_name TEXT,
                    run_type TEXT,
                    frequency TEXT,
                    custom_config TEXT,
                    start_time TEXT,
                    timezone TEXT,
                    status TEXT DEFAULT 'Active',
                    last_run_time TEXT,
                    next_run_time TEXT,
                    enabled INTEGER DEFAULT 0,
                    last_error TEXT
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS column_profiles (
                    platform TEXT,
                    database_name TEXT,
                    schema_name TEXT,
                    table_name TEXT,
                    profile_data TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (platform, database_name, schema_name, table_name)
                )
            """)
            # Create Snowflake and Databricks specific tables for SQLite
            for plat in ["snowflake", "databricks"]:
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {plat}_rules (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        platform TEXT,
                        database_name TEXT,
                        schema_name TEXT,
                        table_name TEXT,
                        column_name TEXT,
                        rule_type TEXT,
                        rule_params TEXT,
                        status TEXT DEFAULT 'Active',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {plat}_rule_executions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        platform TEXT,
                        table_name TEXT,
                        column_name TEXT,
                        rule_type TEXT,
                        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        total_rows INTEGER,
                        failed_rows INTEGER,
                        status TEXT,
                        error_message TEXT
                    )
                """)
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {plat}_anomalies (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title TEXT,
                        msg TEXT,
                        type TEXT,
                        platform TEXT,
                        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        status TEXT DEFAULT 'Active'
                    )
                """)
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {plat}_dq_run_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        platform TEXT,
                        table_name TEXT NOT NULL,
                        run_date TEXT NOT NULL,
                        run_time TEXT NOT NULL,
                        dq_score REAL NOT NULL,
                        total_rows INTEGER NOT NULL,
                        passed_rows INTEGER NOT NULL,
                        failed_rows INTEGER NOT NULL,
                        status TEXT NOT NULL,
                        executed_by TEXT DEFAULT 'User',
                        duration_ms INTEGER DEFAULT 0,
                        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {plat}_column_profiles (
                        platform TEXT,
                        database_name TEXT,
                        schema_name TEXT,
                        table_name TEXT,
                        profile_data TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (platform, database_name, schema_name, table_name)
                    )
                """)
        # Commit table creations before potentially failing ALTER statements
        conn.commit()
        
        # Migration for existing users table
        new_columns = {
            "user_id": "TEXT UNIQUE",
            "full_name": "TEXT",
            "email": "TEXT UNIQUE",
            "status": "TEXT DEFAULT 'PENDING'",
            "platform": "TEXT",
            "created_at": "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
            "approved_at": "TIMESTAMP",
            "approved_by": "TEXT",
            "revoked_at": "TIMESTAMP",
            "last_login_at": "TIMESTAMP",
            "roles": "TEXT",
            "credentials": "TEXT",
            "otp_code": "TEXT",
            "otp_expires_at": "TIMESTAMP"
        }
        for col, col_type in new_columns.items():
            try:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {col} {col_type}")
                conn.commit()
            except Exception:
                conn.rollback() # Required in Postgres to clear aborted transaction state
        
        # Pre-seed Khilesh account
        password = "ValiData26"
        pw_hash = hashlib.sha256(password.encode()).hexdigest()
        
        # Check if user exists
        cursor.execute("SELECT id FROM users WHERE username = %s" if DATABASE_URL else "SELECT id FROM users WHERE username = ?", ("Khilesh",))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO users (username, password_hash, full_name, status) VALUES (%s, %s, %s, %s)" if DATABASE_URL else "INSERT INTO users (username, password_hash, full_name, status) VALUES (?, ?, ?, ?)", 
                ("Khilesh", pw_hash, "Admin Khilesh", "APPROVED")
            )
        else:
            # Ensure Khilesh is approved
            cursor.execute(
                "UPDATE users SET status = 'APPROVED', full_name = 'Admin Khilesh' WHERE username = %s" if DATABASE_URL else "UPDATE users SET status = 'APPROVED', full_name = 'Admin Khilesh' WHERE username = ?", 
                ("Khilesh",)
            )

        # One-time migration to split existing data from generic tables into platform-specific tables
        tables_to_migrate = ["rules", "rule_executions", "anomalies", "dq_run_history", "column_profiles"]
        for tbl in tables_to_migrate:
            try:
                cursor.execute(f"SELECT COUNT(*) as count FROM {tbl}")
                row = cursor.fetchone()
                count = row['count'] if row else 0
                if count > 0:
                    print(f"Migrating {count} rows from legacy {tbl} to platform-specific tables...")
                    cursor.execute(f"SELECT * FROM {tbl}")
                    rows = cursor.fetchall()
                    for r in rows:
                        row_dict = dict(r)
                        plat = row_dict.get('platform')
                        if not plat:
                            if tbl == 'anomalies':
                                msg = str(row_dict.get('msg', '')).lower()
                                if 'databricks' in msg:
                                    plat = 'databricks'
                                else:
                                    plat = 'snowflake'
                            else:
                                plat = 'snowflake'
                        plat = plat.lower()
                        if plat not in ('snowflake', 'databricks'):
                            plat = 'snowflake'
                            
                        if 'id' in row_dict:
                            del row_dict['id']
                            
                        columns_list = list(row_dict.keys())
                        placeholders = ",".join(["%s" if DATABASE_URL else "?" for _ in columns_list])
                        col_names = ",".join(columns_list)
                        values = [row_dict[k] for k in columns_list]
                        
                        already_exists = False
                        try:
                            if tbl == 'rules':
                                check_query = f"SELECT 1 FROM {plat}_rules WHERE database_name = ? AND schema_name = ? AND table_name = ? AND column_name = ? AND rule_type = ?"
                                if DATABASE_URL:
                                    check_query = check_query.replace('?', '%s')
                                cursor.execute(check_query, (row_dict.get('database_name'), row_dict.get('schema_name'), row_dict.get('table_name'), row_dict.get('column_name'), row_dict.get('rule_type')))
                                if cursor.fetchone():
                                    already_exists = True
                            elif tbl == 'column_profiles':
                                check_query = f"SELECT 1 FROM {plat}_column_profiles WHERE database_name = ? AND schema_name = ? AND table_name = ?"
                                if DATABASE_URL:
                                    check_query = check_query.replace('?', '%s')
                                cursor.execute(check_query, (row_dict.get('database_name'), row_dict.get('schema_name'), row_dict.get('table_name')))
                                if cursor.fetchone():
                                    already_exists = True
                        except Exception as e:
                            print(f"Skipping duplicate check for {tbl} due to: {e}")
                            
                        if not already_exists:
                            insert_sql = f"INSERT INTO {plat}_{tbl} ({col_names}) VALUES ({placeholders})"
                            cursor.execute(insert_sql, values)
                    
                    cursor.execute(f"DELETE FROM {tbl}")
                    print(f"Migration for {tbl} complete. Generic table cleared.")
            except Exception as migrate_err:
                print(f"Migration skipped for legacy table {tbl}: {migrate_err}")

        # One-time clean up of legacy mock data if present in Snowflake tables
        try:
            cursor.execute("SELECT COUNT(*) as count FROM snowflake_rules WHERE database_name = %s" if DATABASE_URL else "SELECT COUNT(*) as count FROM snowflake_rules WHERE database_name = ?", ("UNICORN",))
            row = cursor.fetchone()
            has_mock_data = (row['count'] > 0) if row else False
            if has_mock_data:
                print("Legacy mock data detected. Cleaning up rules, executions, and anomalies...")
                cursor.execute("DELETE FROM snowflake_rules")
                cursor.execute("DELETE FROM snowflake_rule_executions")
                cursor.execute("DELETE FROM snowflake_anomalies")
                cursor.execute("DELETE FROM snowflake_dq_run_history")
                print("Cleanup complete.")
        except Exception as cleanup_err:
            print(f"Cleanup of mock data skipped: {cleanup_err}")

        conn.commit()
    except Exception as e:
        print(f"Database initialization error: {e}")
    finally:
        conn.close()

def setup_app_state():
    print("Initializing application state...")

