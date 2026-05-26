import os
import sqlite3
import hashlib
from typing import List, Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from models.rules import RuleExecutionRequest, ProfileRequest, AISuggestionRequest, MetadataRequest, LineageRequest, AnalyticsRequest, CatalogRequest, TableSummaryRequest, AIChatRequest, RuleSyncRequest, ExecutionLogRequest, AnomalyResolveRequest
from core.query_generator import QueryGenerator
from core.lineage_engine import LineageEngine
from core.usage_analyzer import UsageAnalyzer
from connectors.snowflake_connector import SnowflakeConnector
from connectors.databricks_connector import DatabricksConnector
import psycopg2
from psycopg2.extras import RealDictCursor

# Load environment variables
load_dotenv()

app = FastAPI(
    title="Data Quality Control Plane API",
    description="Engine for pushing down data quality rules to Snowflake and Databricks.",
    version="1.0.0"
)

# Enable CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database Setup for Authentication
DB_PATH = "users.db"
DATABASE_URL = os.getenv("DATABASE_URL")

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

def init_db():
    conn, cursor = get_db_connection()
    try:
        if DATABASE_URL:
            # PostgreSQL syntax
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL
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
        else:
            # SQLite syntax
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL
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
        
        # Pre-seed Khilesh account
        password = "ValiData26"
        pw_hash = hashlib.sha256(password.encode()).hexdigest()
        
        # Check if user exists
        cursor.execute("SELECT id FROM users WHERE username = %s" if DATABASE_URL else "SELECT id FROM users WHERE username = ?", ("Khilesh",))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO users (username, password_hash) VALUES (%s, %s)" if DATABASE_URL else "INSERT INTO users (username, password_hash) VALUES (?, ?)", 
                ("Khilesh", pw_hash)
            )

        # One-time clean up of legacy mock data if present
        cursor.execute("SELECT COUNT(*) as count FROM rules WHERE database_name = %s" if DATABASE_URL else "SELECT COUNT(*) as count FROM rules WHERE database_name = ?", ("UNICORN",))
        row = cursor.fetchone()
        has_mock_data = (row['count'] > 0) if row else False
        if has_mock_data:
            print("Legacy mock data detected. Cleaning up rules, executions, and anomalies...")
            cursor.execute("DELETE FROM rules")
            cursor.execute("DELETE FROM rule_executions")
            cursor.execute("DELETE FROM anomalies")
            print("Cleanup complete.")

        conn.commit()
    except Exception as e:
        print(f"Database initialization error: {e}")
    finally:
        conn.close()

init_db()

class AuthRequest(BaseModel):
    username: str
    password: str

@app.post("/api/v1/auth/register")
async def register(request: AuthRequest):
    conn, cursor = get_db_connection()
    pw_hash = hashlib.sha256(request.password.encode()).hexdigest()
    try:
        query = "INSERT INTO users (username, password_hash) VALUES (%s, %s)" if DATABASE_URL else "INSERT INTO users (username, password_hash) VALUES (?, ?)"
        cursor.execute(query, (request.username, pw_hash))
        conn.commit()
        return {"status": "success", "token": f"token_{request.username}_{pw_hash[:10]}"}
    except Exception as e:
        print(f"Registration error: {e}")
        raise HTTPException(status_code=400, detail="Username already exists or database error")
    finally:
        conn.close()

@app.post("/api/v1/auth/login")
async def login(request: AuthRequest):
    conn, cursor = get_db_connection()
    pw_hash = hashlib.sha256(request.password.encode()).hexdigest()
    try:
        query = "SELECT * FROM users WHERE username = %s AND password_hash = %s" if DATABASE_URL else "SELECT * FROM users WHERE username = ? AND password_hash = ?"
        cursor.execute(query, (request.username, pw_hash))
        user = cursor.fetchone()
        
        if user:
            return {"status": "success", "token": f"token_{request.username}_{pw_hash[:10]}"}
        else:
            raise HTTPException(status_code=401, detail="Invalid username or password")
    finally:
        conn.close()

@app.post("/api/v1/auth/test-connection")
async def test_connection(request: MetadataRequest):
    try:
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            snowflake_engine.execute_query("SELECT 1")
            snowflake_engine.disconnect()
        elif request.platform == "databricks":
            databricks_engine.connect(request.credentials)
            databricks_engine.execute_query("SELECT 1")
            databricks_engine.disconnect()
        return {"status": "success", "message": "Connection successful!"}
    except Exception as e:
        import traceback
        error_detail = f"{str(e)}\n{traceback.format_exc()}"
        print(f"Connection test failed: {error_detail}")
        raise HTTPException(status_code=500, detail=str(e))

# Initialize Connectors
snowflake_engine = SnowflakeConnector()
databricks_engine = DatabricksConnector()

@app.post("/api/v1/rules/execute")
async def execute_rule(request: RuleExecutionRequest):
    try:
        sql_query = QueryGenerator.generate_dq_rule_sql(
            platform=request.platform,
            table=request.table_name,
            column=request.column_name,
            rule_type=request.rule_type,
            rule_params=request.rule_params
        )
        result = None
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            result = snowflake_engine.execute_query(sql_query)
            snowflake_engine.disconnect()
        elif request.platform == "databricks":
            databricks_engine.connect(request.credentials)
            result = databricks_engine.execute_query(sql_query)
            databricks_engine.disconnect()

        # Log rule execution in the database
        if result and isinstance(result, list) and len(result) > 0:
            first_row = result[0]
            total_rows = first_row.get('TOTAL_ROWS') or first_row.get('total_rows') or 0
            failed_rows = first_row.get('FAILED_ROWS') or first_row.get('failed_rows') or 0
            status = 'pass' if failed_rows == 0 else 'fail'
            
            conn_log, cursor_log = get_db_connection()
            try:
                # Add to rules table if not present, to ensure it shows as active rule
                parts = request.table_name.split('.')
                db_name = parts[0] if len(parts) > 0 else 'UNKNOWN'
                sch_name = parts[1] if len(parts) > 1 else 'UNKNOWN'
                tbl_name = parts[2] if len(parts) > 2 else request.table_name
                
                check_rule_query = """
                    SELECT id FROM rules 
                    WHERE platform = %s AND database_name = %s AND schema_name = %s AND table_name = %s AND column_name = %s AND rule_type = %s
                """ if DATABASE_URL else """
                    SELECT id FROM rules 
                    WHERE platform = ? AND database_name = ? AND schema_name = ? AND table_name = ? AND column_name = ? AND rule_type = ?
                """
                cursor_log.execute(check_rule_query, (
                    request.platform, db_name, sch_name, tbl_name, request.column_name, request.rule_type
                ))
                if not cursor_log.fetchone():
                    insert_rule_query = """
                        INSERT INTO rules (platform, database_name, schema_name, table_name, column_name, rule_type, rule_params, status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """ if DATABASE_URL else """
                        INSERT INTO rules (platform, database_name, schema_name, table_name, column_name, rule_type, rule_params, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """
                    import json
                    cursor_log.execute(insert_rule_query, (
                        request.platform, db_name, sch_name, tbl_name, request.column_name, request.rule_type, json.dumps(request.rule_params or {}), 'Active'
                    ))
                
                # Log execution
                exec_log_query = """
                    INSERT INTO rule_executions (platform, table_name, column_name, rule_type, total_rows, failed_rows, status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """ if DATABASE_URL else """
                    INSERT INTO rule_executions (platform, table_name, column_name, rule_type, total_rows, failed_rows, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """
                cursor_log.execute(exec_log_query, (
                    request.platform, request.table_name, request.column_name, request.rule_type, total_rows, failed_rows, status
                ))
                
                # If failed, log anomaly
                if failed_rows > 0:
                    msg_text = f"{request.table_name}: {request.column_name} column failed {request.rule_type}. {failed_rows} failed rows."
                    title_text = f"{request.rule_type} Failure"
                    if request.rule_type == 'NULL_CHECK':
                        title_text = "Null Rate Violation"
                        msg_text = f"{request.table_name}: {request.column_name} column showed a sudden jump in nulls ({failed_rows} records)."
                    elif request.rule_type == 'UNIQUE_CHECK':
                        title_text = "Uniqueness Violation"
                        msg_text = f"{request.table_name}: {request.column_name} column has duplicates."
                        
                    check_anom = """
                        SELECT id FROM anomalies WHERE title = %s AND msg = %s AND status = 'Active'
                    """ if DATABASE_URL else """
                        SELECT id FROM anomalies WHERE title = ? AND msg = ? AND status = 'Active'
                    """
                    cursor_log.execute(check_anom, (title_text, msg_text))
                    if not cursor_log.fetchone():
                        cursor_log.execute(
                            "INSERT INTO anomalies (title, msg, type, status) VALUES (%s, %s, %s, %s)" if DATABASE_URL else "INSERT INTO anomalies (title, msg, type, status) VALUES (?, ?, ?, ?)",
                            (title_text, msg_text, "null" if "null" in title_text.lower() else "uniqueness", "Active")
                        )
                conn_log.commit()
            except Exception as e_log:
                print(f"Failed to log execution details: {e_log}")
            finally:
                conn_log.close()

        return {"status": "success", "platform": request.platform, "executed_query": sql_query.strip(), "results": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/ai/suggest_rules")
async def suggest_rules(request: AISuggestionRequest):
    try:
        sql_query = QueryGenerator.generate_ai_suggestion_sql(request.platform, request.table_name, request.column_name)
        result = None
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            result = snowflake_engine.execute_query(sql_query)
            snowflake_engine.disconnect()
        elif request.platform == "databricks":
            databricks_engine.connect(request.credentials)
            result = databricks_engine.execute_query(sql_query)
            databricks_engine.disconnect()
        return {"status": "success", "platform": request.platform, "executed_query": sql_query.strip(), "ai_suggestions": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/ai/chat")
async def ai_chat(request: AIChatRequest):
    try:
        context_table = request.context_table or "Unknown"
        system_prompt = (
            f"You are ValiData AI, a Senior Data Architect and Quality Expert. "
            f"Currently analyzing table: {context_table}. "
            "Provide technical, accurate, and professional advice. "
            "If asked to suggest rules, focus on NULLs, uniqueness, and data patterns."
        )
        sql_query = QueryGenerator.generate_chat_agent_sql(request.platform, system_prompt, request.messages)
        result = None
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            result = snowflake_engine.execute_query(sql_query)
            snowflake_engine.disconnect()
        elif request.platform == "databricks":
            databricks_engine.connect(request.credentials)
            result = databricks_engine.execute_query(sql_query)
            databricks_engine.disconnect()
        ai_response = result[0].get('ai_response') if result else "I couldn't process that request."
        return {"status": "success", "platform": request.platform, "response": ai_response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/metadata/entities")
async def get_metadata_entities(request: MetadataRequest):
    try:
        sql_query = QueryGenerator.generate_metadata_sql(request.platform, request.entity_type, request.database_name, request.schema_name, request.table_name)
        result = None
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            result = snowflake_engine.execute_query(sql_query)
            snowflake_engine.disconnect()
        elif request.platform == "databricks":
            databricks_engine.connect(request.credentials)
            result = databricks_engine.execute_query(sql_query)
            databricks_engine.disconnect()
        entities = []
        if result:
            if request.platform == "snowflake":
                key = 'column_name' if request.entity_type == 'columns' else 'name'
                for row in result:
                    if request.entity_type == 'columns':
                        entities.append({"name": row.get('column_name'), "type": row.get('data_type'), "nullable": row.get('is_nullable') == 'YES'})
                    else:
                        val = row.get(key) or row.get(key.upper())
                        if val: entities.append(val)
            elif request.platform == "databricks":
                key_map = {"databases": "catalog", "schemas": "databaseName", "tables": "tableName", "columns": "col_name"}
                key = key_map.get(request.entity_type, "name")
                for row in result:
                    if request.entity_type == 'columns':
                        entities.append({"name": row.get(key), "type": row.get('data_type'), "nullable": True})
                    else:
                        val = row.get(key) or row.get(key.upper())
                        if val: entities.append(val)
        return {"status": "success", "platform": request.platform, "entities": entities}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/metadata/row_count")
async def get_table_row_count(request: TableSummaryRequest):
    try:
        sql_query = f"SELECT COUNT(*) as row_count FROM {request.table_name}"
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            res = snowflake_engine.execute_query(sql_query)
            snowflake_engine.disconnect()
        elif request.platform == "databricks":
            databricks_engine.connect(request.credentials)
            res = databricks_engine.execute_query(sql_query)
            databricks_engine.disconnect()
        count = res[0].get('row_count') if res else 0
        return {"status": "success", "row_count": count}
    except Exception as e:
        print(f"Row count failed for {request.table_name}: {e}")
        return {"status": "success", "row_count": 0}

@app.post("/api/v1/metadata/profile")
async def get_column_profile(request: ProfileRequest):
    try:
        sql_query = QueryGenerator.generate_profiling_sql(
            platform=request.platform,
            db=request.database_name,
            schema=request.schema_name,
            table=request.table_name,
            column=request.column_name
        )
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            res = snowflake_engine.execute_query(sql_query)
            snowflake_engine.disconnect()
        elif request.platform == "databricks":
            databricks_engine.connect(request.credentials)
            res = databricks_engine.execute_query(sql_query)
            databricks_engine.disconnect()
        else:
            res = []
        
        # Normalize all keys to lowercase so frontend can reliably read them
        # regardless of Snowflake (UPPERCASE) vs Databricks (lowercase) conventions
        if res and isinstance(res, list) and len(res) > 0:
            raw = res[0]
            normalized = {k.lower(): v for k, v in raw.items()} if raw else {}
            print(f"Profile result for {request.column_name}: {normalized}")
            return {"status": "success", "profile": normalized}
        return {"status": "success", "profile": {}}
    except Exception as e:
        print(f"Profile endpoint error for {request.column_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/lineage/infer")
async def infer_lineage(request: LineageRequest):
    try:
        if request.platform == "snowflake": snowflake_engine.connect(request.credentials)
        elif request.platform == "databricks": databricks_engine.connect(request.credentials)
        sql_query = QueryGenerator.generate_information_schema_sql(request.platform, request.database_name, request.schema_name)
        result = snowflake_engine.execute_query(sql_query) if request.platform == "snowflake" else databricks_engine.execute_query(sql_query)
        lineage_graph = LineageEngine.infer_relationships(result)
        return {"status": "success", "nodes": lineage_graph["nodes"], "edges": lineage_graph["edges"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if request.platform == "snowflake": snowflake_engine.disconnect()
        elif request.platform == "databricks": databricks_engine.disconnect()

@app.post("/api/v1/analytics/usage")
async def get_usage_analytics(request: AnalyticsRequest):
    try:
        if request.platform == "snowflake": snowflake_engine.connect(request.credentials)
        elif request.platform == "databricks": databricks_engine.connect(request.credentials)
        
        sql_query = QueryGenerator.generate_query_history_sql(request.platform, request.days_back or 7)
        result = snowflake_engine.execute_query(sql_query) if request.platform == "snowflake" else databricks_engine.execute_query(sql_query)
        analytics = UsageAnalyzer.analyze_queries(result)
        return {"status": "success", "analytics": analytics}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if request.platform == "snowflake": snowflake_engine.disconnect()
        elif request.platform == "databricks": databricks_engine.disconnect()

@app.post("/api/v1/ai/table_summary")
async def generate_table_summary(request: TableSummaryRequest):
    try:
        sql_query = QueryGenerator.generate_table_summary_sql(request.platform, request.table_name)
        result = snowflake_engine.execute_query(sql_query) if request.platform == "snowflake" else databricks_engine.execute_query(sql_query)
        summary = result[0].get('TABLE_SUMMARY') if result else ""
        return {"status": "success", "summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/catalog/tables")
async def get_catalog_tables(request: CatalogRequest):
    try:
        sql_query = QueryGenerator.generate_catalog_sql(request.platform)
        result = None
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            result = snowflake_engine.execute_query(sql_query)
            snowflake_engine.disconnect()
        elif request.platform == "databricks":
            databricks_engine.connect(request.credentials)
            result = databricks_engine.execute_query(sql_query)
            databricks_engine.disconnect()
        return {"status": "success", "tables": result or []}
    except Exception as e:
        print(f"Catalog connection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/metadata/preview")
async def get_table_preview(request: LineageRequest):
    try:
        sql_query = QueryGenerator.generate_preview_sql(request.platform, request.database_name, request.schema_name, request.table_name)
        print(f"Executing preview query on {request.platform}: {sql_query}")
        result = None
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            result = snowflake_engine.execute_query(sql_query)
            snowflake_engine.disconnect()
        elif request.platform == "databricks":
            databricks_engine.connect(request.credentials)
            result = databricks_engine.execute_query(sql_query)
            databricks_engine.disconnect()
        
        serialized_rows = [{str(k): str(v) for k, v in row.items()} for row in result] if result else []
        return {"status": "success", "rows": serialized_rows}
    except Exception as e:
        import traceback
        print(f"Preview failed: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/dashboard/metrics")
async def get_dashboard_metrics():
    conn, cursor = get_db_connection()
    try:
        # Active Rules Count
        cursor.execute("SELECT COUNT(*) as count FROM rules WHERE status = 'Active'")
        row = cursor.fetchone()
        active_rules_count = row['count'] if row else 0

        # Passed Checks Count (Latest execution status of each rule)
        cursor.execute("""
            SELECT COUNT(*) as count FROM rule_executions 
            WHERE id IN (
                SELECT MAX(id) FROM rule_executions 
                GROUP BY platform, table_name, column_name, rule_type
            ) AND status = 'pass'
        """)
        row = cursor.fetchone()
        passed_checks_count = row['count'] if row else 0

        # Active Anomalies Count
        cursor.execute("SELECT COUNT(*) as count FROM anomalies WHERE status = 'Active'")
        row = cursor.fetchone()
        anomalies_count = row['count'] if row else 0

        return {
            "active_rules_count": active_rules_count,
            "passed_checks_count": passed_checks_count,
            "anomalies_count": anomalies_count
        }
    except Exception as e:
        print(f"Error fetching dashboard metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/v1/dashboard/rules")
async def get_dashboard_rules():
    conn, cursor = get_db_connection()
    try:
        cursor.execute("SELECT * FROM rules ORDER BY created_at DESC")
        rows = cursor.fetchall()
        rules = [dict(row) for row in rows]
        return {"status": "success", "rules": rules}
    except Exception as e:
        print(f"Error fetching dashboard rules: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/v1/dashboard/anomalies")
async def get_dashboard_anomalies():
    conn, cursor = get_db_connection()
    try:
        cursor.execute("SELECT * FROM anomalies WHERE status = 'Active' ORDER BY detected_at DESC")
        rows = cursor.fetchall()
        anomalies = [dict(row) for row in rows]
        return {"status": "success", "anomalies": anomalies}
    except Exception as e:
        print(f"Error fetching dashboard anomalies: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/v1/dashboard/rules/sync")
async def sync_dashboard_rules(request: RuleSyncRequest):
    conn, cursor = get_db_connection()
    try:
        # Clear existing rules to perfectly synchronize with client local state
        # Determine distinct tables to clear existing rules for those tables only
        tables_to_clear = set()
        for r in request.rules:
            tables_to_clear.add((r.database_name, r.schema_name, r.table_name))
        for db_name, sch_name, tbl_name in tables_to_clear:
            cursor.execute(
                "DELETE FROM rules WHERE database_name = %s AND schema_name = %s AND table_name = %s" if DATABASE_URL else
                "DELETE FROM rules WHERE database_name = ? AND schema_name = ? AND table_name = ?",
                (db_name, sch_name, tbl_name)
            )
        
        for r in request.rules:
            import json
            params_str = json.dumps(r.rule_params) if r.rule_params else "{}"
            insert_query = """
                INSERT INTO rules (platform, database_name, schema_name, table_name, column_name, rule_type, rule_params, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """ if DATABASE_URL else """
                INSERT INTO rules (platform, database_name, schema_name, table_name, column_name, rule_type, rule_params, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """
            cursor.execute(insert_query, (
                r.platform, r.database_name, r.schema_name, r.table_name, r.column_name, r.rule_type, params_str, r.status
            ))
        conn.commit()
        cursor.execute("SELECT * FROM rules ORDER BY created_at DESC")
        rows = cursor.fetchall()
        rules = [dict(row) for row in rows]
        return {"status": "success", "rules": rules}
    except Exception as e:
        print(f"Error syncing rules: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/v1/dashboard/rules")
async def get_dashboard_rules():
    conn, cursor = get_db_connection()
    try:
        cursor.execute("SELECT * FROM rules ORDER BY created_at DESC")
        rows = cursor.fetchall()
        rules = [dict(row) for row in rows]
        return {"status": "success", "rules": rules}
    except Exception as e:
        print(f"Error fetching dashboard rules: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/v1/dashboard/executions")
async def log_dashboard_executions(request: ExecutionLogRequest):
    conn, cursor = get_db_connection()
    try:
        executions_data = []
        for ex in request.executions:
            executions_data.append((
                request.platform, request.table_name, ex.column_name, ex.rule_type, ex.total_rows, ex.failed_rows, ex.status
            ))
            
            # If failed, log an anomaly automatically
            if ex.failed_rows > 0 or ex.status == 'fail':
                msg_text = f"{request.table_name}: {ex.column_name} column failed {ex.rule_type}. {ex.failed_rows} failed rows."
                title_text = f"{ex.rule_type} Failure"
                if ex.rule_type == 'Null Check' or ex.rule_type == 'NULL_CHECK':
                    title_text = "Null Rate Violation"
                    msg_text = f"{request.table_name}: {ex.column_name} column showed a sudden jump in nulls ({ex.failed_rows} records)."
                elif ex.rule_type == 'Unique Check' or ex.rule_type == 'UNIQUE_CHECK':
                    title_text = "Uniqueness Violation"
                    msg_text = f"{request.table_name}: {ex.column_name} column has duplicates."
                
                check_anomaly_query = """
                    SELECT id FROM anomalies 
                    WHERE title = %s AND msg = %s AND status = 'Active'
                """ if DATABASE_URL else """
                    SELECT id FROM anomalies 
                    WHERE title = ? AND msg = ? AND status = 'Active'
                """
                cursor.execute(check_anomaly_query, (title_text, msg_text))
                if not cursor.fetchone():
                    cursor.execute(
                        "INSERT INTO anomalies (title, msg, type, status) VALUES (%s, %s, %s, %s)" if DATABASE_URL else "INSERT INTO anomalies (title, msg, type, status) VALUES (?, ?, ?, ?)",
                        (title_text, msg_text, "null" if "null" in title_text.lower() else "uniqueness", "Active")
                    )

        execs_query = """
            INSERT INTO rule_executions (platform, table_name, column_name, rule_type, total_rows, failed_rows, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """ if DATABASE_URL else """
            INSERT INTO rule_executions (platform, table_name, column_name, rule_type, total_rows, failed_rows, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        cursor.executemany(execs_query, executions_data)
        conn.commit()
        return {"status": "success", "message": f"Successfully logged {len(request.executions)} executions."}
    except Exception as e:
        print(f"Error logging executions: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/v1/dashboard/anomalies/resolve")
async def resolve_dashboard_anomaly(request: AnomalyResolveRequest):
    conn, cursor = get_db_connection()
    try:
        query = "UPDATE anomalies SET status = %s WHERE id = %s" if DATABASE_URL else "UPDATE anomalies SET status = ? WHERE id = ?"
        cursor.execute(query, ("Resolved", request.id))
        conn.commit()
        return {"status": "success", "message": f"Anomaly {request.id} resolved successfully."}
    except Exception as e:
        print(f"Error resolving anomaly: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/health")
def health_check():
    return {"status": "healthy"}
