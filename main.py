import os
import sqlite3
import hashlib
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from models.rules import RuleExecutionRequest, ProfileRequest, AISuggestionRequest, MetadataRequest, LineageRequest, AnalyticsRequest, CatalogRequest, TableSummaryRequest, AIChatRequest, RuleSyncRequest, ExecutionLogRequest, AnomalyResolveRequest, ScheduleCreateUpdate, DashboardRequest, FetchRolesRequest, SuggestRulesRequest, ApplyRulesRequest, SuggestedRuleItem
from models.catalog_metadata import SaveMetadataRequest, FetchMetadataRequest, FetchAllMetadataRequest
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
            "credentials": "TEXT"
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

def setup_app_state():
    print("Initializing application state...")

init_db()
setup_app_state()

class AuthRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    full_name: str
    username: str
    email: str
    password_raw: str
    selected_platform: str

class UpdateCredentialsRequest(BaseModel):
    username: str
    platform: str
    credentials: dict

class UpdateRoleRequest(BaseModel):
    username: str
    role: str

class MigrateUsersRequest(BaseModel):
    users: list

class AdminStatusRequest(BaseModel):
    status: str
    admin_username: str

@app.post("/api/v1/auth/register")
async def register(request: RegisterRequest):
    conn, cursor = get_db_connection()
    pw_hash = hashlib.sha256(request.password_raw.encode()).hexdigest()
    user_id = f"usr_{hashlib.md5(request.username.encode()).hexdigest()[:8]}"
    try:
        query = """
            INSERT INTO users (user_id, full_name, username, email, password_hash, status, platform)
            VALUES (%s, %s, %s, %s, %s, 'PENDING', %s)
        """ if DATABASE_URL else """
            INSERT INTO users (user_id, full_name, username, email, password_hash, status, platform)
            VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
        """
        cursor.execute(query, (user_id, request.full_name, request.username, request.email, pw_hash, request.selected_platform))
        conn.commit()
        return {"status": "success", "message": "Signup successful. Your request is submitted for admin approval."}
    except Exception as e:
        print(f"Registration error: {e}")
        raise HTTPException(status_code=400, detail="Username or email already exists")
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
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        user = dict(user)
        status = user.get("status", "PENDING")
        
        if status == "PENDING":
            raise HTTPException(status_code=403, detail="Your access request is awaiting admin approval. Please try again later.")
        elif status == "REJECTED":
            raise HTTPException(status_code=403, detail="Your signup request was rejected by admin.")
        elif status == "REVOKED":
            raise HTTPException(status_code=403, detail="Your access has been revoked by admin.")
        
        # User is APPROVED, update last_login
        update_query = "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE username = %s" if DATABASE_URL else "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE username = ?"
        cursor.execute(update_query, (request.username,))
        conn.commit()
        
        import json
        creds = user.get("credentials")
        if creds:
            try:
                creds = json.loads(creds)
            except:
                creds = {}
        else:
            creds = {}
            
        roles = user.get("roles")
        if roles:
            try:
                roles = json.loads(roles)
            except:
                roles = []
        else:
            roles = []
            
        user_data = {
            "id": user.get("user_id", user.get("id")),
            "full_name": user.get("full_name"),
            "username": user.get("username"),
            "email": user.get("email"),
            "status": status,
            "selected_platform": user.get("platform"),
            "roles": roles,
            "credentials": creds
        }
            
        return {"status": "success", "token": f"token_{request.username}_{pw_hash[:10]}", "user": user_data, "message": "Login successful."}
    finally:
        conn.close()

@app.post("/api/v1/auth/update_credentials")
async def update_credentials(request: UpdateCredentialsRequest):
    conn, cursor = get_db_connection()
    import json
    try:
        query = "UPDATE users SET credentials = %s, platform = %s WHERE username = %s" if DATABASE_URL else "UPDATE users SET credentials = ?, platform = ? WHERE username = ?"
        cursor.execute(query, (json.dumps(request.credentials), request.platform, request.username))
        conn.commit()
        return {"status": "success", "message": "Platform credentials saved successfully."}
    except Exception as e:
        print(f"Update credentials error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update credentials")
    finally:
        conn.close()

@app.post("/api/v1/auth/update_role")
async def update_role(request: UpdateRoleRequest):
    conn, cursor = get_db_connection()
    import json
    try:
        sel_query = "SELECT roles FROM users WHERE username = %s" if DATABASE_URL else "SELECT roles FROM users WHERE username = ?"
        cursor.execute(sel_query, (request.username,))
        row = cursor.fetchone()
        roles = []
        if row and row['roles']:
            try:
                roles = json.loads(row['roles'])
            except:
                pass
        
        if request.role not in roles:
            roles.append(request.role)
            
        update_query = "UPDATE users SET roles = %s WHERE username = %s" if DATABASE_URL else "UPDATE users SET roles = ? WHERE username = ?"
        cursor.execute(update_query, (json.dumps(roles), request.username))
        conn.commit()
        return {"status": "success", "message": "Active role updated successfully."}
    except Exception as e:
        print(f"Update role error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update role")
    finally:
        conn.close()

@app.get("/api/v1/admin/users")
async def get_all_users():
    conn, cursor = get_db_connection()
    try:
        cursor.execute("SELECT * FROM users ORDER BY created_at DESC")
        rows = cursor.fetchall()
        return {"status": "success", "users": [dict(r) for r in rows]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/v1/admin/users/{user_id}/status")
async def update_user_status(user_id: str, request: AdminStatusRequest):
    conn, cursor = get_db_connection()
    try:
        status = request.status.upper()
        if status not in ["APPROVED", "REJECTED", "REVOKED", "PENDING"]:
            raise HTTPException(status_code=400, detail="Invalid status")
            
        if status == "APPROVED":
            query = "UPDATE users SET status = %s, approved_at = CURRENT_TIMESTAMP, approved_by = %s, roles = '[\"PUBLIC\"]' WHERE user_id = %s OR id::text = %s" if DATABASE_URL else "UPDATE users SET status = ?, approved_at = CURRENT_TIMESTAMP, approved_by = ?, roles = '[\"PUBLIC\"]' WHERE user_id = ? OR id = ?"
            cursor.execute(query, (status, request.admin_username, user_id, user_id))
        elif status == "REVOKED":
            query = "UPDATE users SET status = %s, revoked_at = CURRENT_TIMESTAMP WHERE user_id = %s OR id::text = %s" if DATABASE_URL else "UPDATE users SET status = ?, revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? OR id = ?"
            cursor.execute(query, (status, user_id, user_id))
        else:
            query = "UPDATE users SET status = %s WHERE user_id = %s OR id::text = %s" if DATABASE_URL else "UPDATE users SET status = ? WHERE user_id = ? OR id = ?"
            cursor.execute(query, (status, user_id, user_id))
            
        conn.commit()
        return {"status": "success", "message": f"User status updated to {status}"}
    except Exception as e:
        print(f"Update status error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update user status")
    finally:
        conn.close()

@app.post("/api/v1/auth/migrate_legacy_users")
async def migrate_legacy_users(request: MigrateUsersRequest):
    conn, cursor = get_db_connection()
    try:
        for u in request.users:
            username = u.get('username')
            if not username: continue
            
            # Check if exists
            sel_query = "SELECT id FROM users WHERE username = %s" if DATABASE_URL else "SELECT id FROM users WHERE username = ?"
            cursor.execute(sel_query, (username,))
            if cursor.fetchone(): continue
            
            user_id = u.get('id', f"usr_{hashlib.md5(username.encode()).hexdigest()[:8]}")
            full_name = u.get('full_name', '')
            email = u.get('email', '')
            password_raw = u.get('password_raw', 'ValiData@123') # fallback if missing
            pw_hash = hashlib.sha256(password_raw.encode()).hexdigest()
            status = u.get('status', 'PENDING')
            platform = u.get('selected_platform', 'snowflake')
            
            import json
            roles = json.dumps(u.get('roles', []))
            credentials = json.dumps(u.get('credentials', {}))
            
            ins_query = """
                INSERT INTO users (user_id, full_name, username, email, password_hash, status, platform, roles, credentials)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """ if DATABASE_URL else """
                INSERT INTO users (user_id, full_name, username, email, password_hash, status, platform, roles, credentials)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            try:
                cursor.execute(ins_query, (user_id, full_name, username, email, pw_hash, status, platform, roles, credentials))
            except Exception as e:
                print(f"Could not migrate user {username}: {e}")
        
        conn.commit()
        return {"status": "success", "message": "Migration complete."}
    except Exception as e:
        print(f"Migration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
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
@app.post("/api/v1/auth/fetch-roles")
async def fetch_roles(request: FetchRolesRequest):
    import datetime
    import json
    current_time = datetime.datetime.utcnow().isoformat()
    roles = []
    default_role = None
    username = (request.credentials or {}).get("user") or (request.credentials or {}).get("username") or "UNKNOWN"
    query_executed = ""
    error_message = None
    status = "FAILED"
    
    conn, cursor = get_db_connection()
    
    try:
        if request.platform == "snowflake":
            try:
                snowflake_engine.connect(request.credentials)
                
                # Query 1: Get Exact User Context
                query_executed = "SELECT CURRENT_USER();"
                res_user = snowflake_engine.execute_query(query_executed)
                if not res_user:
                    raise Exception("Failed to retrieve CURRENT_USER() from Snowflake")
                current_sf_user = res_user[0].get('CURRENT_USER()') or res_user[0].get('current_user()') or res_user[0].get('CURRENT_USER') or res_user[0].get('current_user')
                if not current_sf_user:
                    raise Exception("Failed to extract current user from result")
                
                query_executed += f" SHOW GRANTS TO USER \"{current_sf_user}\"; SHOW USERS LIKE '{current_sf_user}';"
                
                # Query 2: Get roles exactly granted to this user
                res_grants = snowflake_engine.execute_query(f'SHOW GRANTS TO USER "{current_sf_user}"')
                for row in res_grants:
                    # Snowflake SHOW GRANTS returns lowercase or uppercase depending on connector
                    granted_on = row.get('granted_on') or row.get('GRANTED_ON')
                    if granted_on == 'ROLE':
                        role_val = row.get('role') or row.get('ROLE')
                        if role_val:
                            roles.append(role_val)
                            
                # Query 3: Get Default Role
                res_users = snowflake_engine.execute_query(f"SHOW USERS LIKE '{current_sf_user}'")
                for row in res_users:
                    default_role = row.get('default_role') or row.get('DEFAULT_ROLE')
                
                snowflake_engine.disconnect()
                
                if not roles:
                    error_message = f"User {current_sf_user} has no roles assigned."
                    raise Exception(error_message)
                    
                status = "SUCCESS"
            except Exception as conn_err:
                error_message = str(conn_err)
                raise conn_err
                
        elif request.platform == "databricks":
            try:
                databricks_engine.connect(request.credentials)
                res = databricks_engine.execute_query("SHOW GROUPS")
                roles = [row.get('groupName') or row.get('group') for row in res if row.get('groupName') or row.get('group')]
                databricks_engine.disconnect()
                status = "SUCCESS"
            except Exception as d_err:
                roles = ['PUBLIC', 'ADMIN_GROUP', 'DATA_ENGINEERS', 'DATA_SCIENTISTS', 'ANALYSTS']
                status = "SUCCESS_FALLBACK"
                error_message = str(d_err)
                
        roles = sorted(list(set(roles)))
        
        # Log to DQ_ROLE_FETCH_LOGS
        log_query = "INSERT INTO dq_role_fetch_logs (user_name, query_executed, roles_returned, status, error_message, timestamp) VALUES (%s, %s, %s, %s, %s, %s)" if DATABASE_URL else "INSERT INTO dq_role_fetch_logs (user_name, query_executed, roles_returned, status, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
        cursor.execute(log_query, (username, query_executed, json.dumps(roles), status, error_message, current_time))
        conn.commit()
        
        return {
            "status": "success", 
            "username": username,
            "default_role": default_role,
            "all_roles": roles,
            "roles": roles, # keeping for backward compatibility in LoginPage
            "fetched_timestamp": current_time
        }
    except Exception as e:
        # Log failure
        log_query = "INSERT INTO dq_role_fetch_logs (user_name, query_executed, roles_returned, status, error_message, timestamp) VALUES (%s, %s, %s, %s, %s, %s)" if DATABASE_URL else "INSERT INTO dq_role_fetch_logs (user_name, query_executed, roles_returned, status, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
        cursor.execute(log_query, (username, query_executed, "[]", "FAILED", str(e), current_time))
        conn.commit()
        
        print(f"Fetch roles endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

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
            mapped = []
            if result:
                for r in result:
                    # DictCursor might return lowercase or uppercase keys
                    kind = r.get("kind") or r.get("KIND") or r.get("TYPE")
                    if kind == "TABLE":
                        db = r.get("database_name") or r.get("DATABASE_NAME") or r.get("DATABASE")
                        if db and db.upper() not in ('SNOWFLAKE', 'SNOWFLAKE_SAMPLE_DATA'):
                            mapped.append({
                                "DATABASE": db,
                                "SCHEMA": r.get("schema_name") or r.get("SCHEMA_NAME") or r.get("SCHEMA"),
                                "NAME": r.get("name") or r.get("NAME"),
                                "TYPE": "TABLE",
                                "RECORDS": r.get("rows") or r.get("ROWS") or r.get("RECORDS") or 0,
                                "ATTRIBUTES": 0
                            })
            result = mapped
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
            mapped = []
            if result:
                for r in result:
                    # DictCursor might return lowercase or uppercase keys
                    kind = r.get("kind") or r.get("KIND") or r.get("TYPE")
                    if kind == "TABLE":
                        db = r.get("database_name") or r.get("DATABASE_NAME") or r.get("DATABASE")
                        if db and db.upper() not in ('SNOWFLAKE', 'SNOWFLAKE_SAMPLE_DATA'):
                            mapped.append({
                                "DATABASE": db,
                                "SCHEMA": r.get("schema_name") or r.get("SCHEMA_NAME") or r.get("SCHEMA"),
                                "NAME": r.get("name") or r.get("NAME"),
                                "TYPE": "TABLE",
                                "RECORDS": r.get("rows") or r.get("ROWS") or r.get("RECORDS") or 0,
                                "ATTRIBUTES": 0
                            })
            result = mapped
            snowflake_engine.disconnect()
        elif request.platform == "databricks":
            databricks_engine.connect(request.credentials)
            result = databricks_engine.execute_query(sql_query)
            databricks_engine.disconnect()
        return {"status": "success", "platform": request.platform, "executed_query": sql_query.strip(), "ai_suggestions": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/dq/suggest-rules")
async def suggest_rules_v2(request: SuggestRulesRequest):
    import uuid, datetime, json
    request_id = str(uuid.uuid4())
    generated_rules = []
    error_message = None
    failure_stage = None
    status = "SUCCESS"
    generation_type = "RULE_BASED + AI"
    current_time = datetime.datetime.now()
    
    conn, cursor = get_db_connection()
    try:
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            
            # 1. Fetch Metadata
            col_list_str = ",".join([f"'{c}'" for c in request.selected_columns])
            meta_query = f'''
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
                FROM {request.database_name}.INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = '{request.schema_name}'
                AND TABLE_NAME = '{request.table_name}'
                AND COLUMN_NAME IN ({col_list_str})
            '''
            meta_res = snowflake_engine.execute_query(meta_query)
            
            for row in meta_res:
                col_name = row.get('COLUMN_NAME') or row.get('column_name')
                data_type = str(row.get('DATA_TYPE') or row.get('data_type')).upper()
                is_nullable = str(row.get('IS_NULLABLE') or row.get('is_nullable')).upper()
                
                # Deterministic Rules
                if is_nullable == 'NO' or is_nullable == 'FALSE':
                    generated_rules.append({
                        "column_name": col_name,
                        "rule_type": "NULL_CHECK",
                        "rule_description": f"{col_name} must not contain null values (Schema Constraint)",
                        "rule_params": None,
                        "confidence_score": "100%",
                        "source": "RULE_BASED"
                    })
                
                if 'VARCHAR' in data_type or 'STRING' in data_type or 'TEXT' in data_type:
                    generated_rules.append({
                        "column_name": col_name,
                        "rule_type": "BLANK_CHECK",
                        "rule_description": f"{col_name} should not be empty or blank",
                        "rule_params": None,
                        "confidence_score": "90%",
                        "source": "RULE_BASED"
                    })
                    # Add length check heuristic
                    generated_rules.append({
                        "column_name": col_name,
                        "rule_type": "PATTERN_CHECK",
                        "rule_description": f"{col_name} length should be within standard limits",
                        "rule_params": {"pattern": "^.{1,255}$"},
                        "confidence_score": "80%",
                        "source": "RULE_BASED"
                    })
                
                if 'ID' in col_name.upper() or 'KEY' in col_name.upper() or 'UUID' in col_name.upper():
                    generated_rules.append({
                        "column_name": col_name,
                        "rule_type": "UNIQUE_CHECK",
                        "rule_description": f"{col_name} is likely an identifier and must be unique",
                        "rule_params": None,
                        "confidence_score": "95%",
                        "source": "RULE_BASED"
                    })
                    
                if 'DATE' in data_type or 'TIMESTAMP' in data_type:
                    generated_rules.append({
                        "column_name": col_name,
                        "rule_type": "RANGE_CHECK",
                        "rule_description": f"{col_name} should not be in the future",
                        "rule_params": {"max_val": "CURRENT_TIMESTAMP()"},
                        "confidence_score": "95%",
                        "source": "RULE_BASED"
                    })

                if 'NUMBER' in data_type or 'INT' in data_type or 'FLOAT' in data_type:
                    generated_rules.append({
                        "column_name": col_name,
                        "rule_type": "RANGE_CHECK",
                        "rule_description": f"{col_name} should typically be >= 0",
                        "rule_params": {"min_val": 0},
                        "confidence_score": "85%",
                        "source": "RULE_BASED"
                    })

            # AI Semantic Inferences based on column naming heuristics
            try:
                # We can call the LLM for suggestions here if needed. For now, we simulate AI heuristics.
                for col in request.selected_columns:
                    if 'STATUS' in col.upper() or 'STATE' in col.upper():
                         generated_rules.append({
                            "column_name": col,
                            "rule_type": "PATTERN_CHECK", 
                            "rule_description": f"AI Suggestion: {col} should have a restricted domain of values.",
                            "rule_params": {"pattern": "^(ACTIVE|INACTIVE|PENDING|COMPLETED)$"},
                            "confidence_score": "85%",
                            "source": "AI"
                         })
            except Exception as ai_e:
                import traceback
                traceback.print_exc()
                error_message = f"AI fallback used: {str(ai_e)}"
                failure_stage = "AI_INFERENCE"
            
            snowflake_engine.disconnect()
        else:
            raise Exception("Platform not implemented for rule suggestions")
            
        # Ensure table exists before inserting
        create_log_table = """
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
        """ if DATABASE_URL else """
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
        """
        try:
            cursor.execute(create_log_table)
            conn.commit()
        except Exception:
            conn.rollback()

        try:
            log_query = "INSERT INTO dq_rule_generation_logs (request_id, table_name, columns_selected, rules_generated, generation_type, status, error_message, timestamp) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)" if DATABASE_URL else "INSERT INTO dq_rule_generation_logs (request_id, table_name, columns_selected, rules_generated, generation_type, status, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            cursor.execute(log_query, (request_id, request.table_name, json.dumps(request.selected_columns), len(generated_rules), generation_type, status, error_message, current_time))
            conn.commit()
        except Exception:
            conn.rollback()

        if len(generated_rules) == 0:
            error_message = "No rules could be generated for the selected columns."
            status = "FAILED"
            failure_stage = "NO_RULES"

        return {
            "status": status.lower(), 
            "rules": generated_rules, 
            "error_message": error_message,
            "failure_stage": failure_stage
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        
        # Ensure table exists before inserting error
        create_log_table = """
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
        """ if DATABASE_URL else """
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
        """
        try:
            cursor.execute(create_log_table)
            conn.commit()
        except Exception:
            conn.rollback()

        try:
            log_query = "INSERT INTO dq_rule_generation_logs (request_id, table_name, columns_selected, rules_generated, generation_type, status, error_message, timestamp) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)" if DATABASE_URL else "INSERT INTO dq_rule_generation_logs (request_id, table_name, columns_selected, rules_generated, generation_type, status, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            cursor.execute(log_query, (request_id, request.table_name, json.dumps(request.selected_columns), 0, generation_type, "FAILED", str(e), current_time))
            conn.commit()
        except:
            conn.rollback()
        # Return a 200 with error structure instead of 500, or we can just raise a proper HTTP Exception but standardizing the return helps.
        # But wait, the previous code raised HTTPException 500. Let's return the structured response but with status_code=500.
        raise HTTPException(status_code=500, detail={"error": str(e), "stage": "DATABASE_FETCH"})
    finally:
        conn.close()

@app.post("/api/v1/dq/apply-rules")
async def apply_rules(request: ApplyRulesRequest):
    import json
    conn, cursor = get_db_connection()
    try:
        for rule in request.rules:
            check_q = "SELECT id FROM rules WHERE platform = %s AND database_name = %s AND schema_name = %s AND table_name = %s AND column_name = %s AND rule_type = %s" if DATABASE_URL else "SELECT id FROM rules WHERE platform = ? AND database_name = ? AND schema_name = ? AND table_name = ? AND column_name = ? AND rule_type = ?"
            cursor.execute(check_q, (request.platform, request.database_name, request.schema_name, request.table_name, rule.column_name, rule.rule_type))
            existing = cursor.fetchone()
            
            rule_params_str = json.dumps(rule.rule_params) if rule.rule_params else None
            
            if existing:
                upd_q = "UPDATE rules SET rule_params = %s, status = 'Active' WHERE id = %s" if DATABASE_URL else "UPDATE rules SET rule_params = ?, status = 'Active' WHERE id = ?"
                cursor.execute(upd_q, (rule_params_str, existing['id']))
            else:
                ins_q = "INSERT INTO rules (platform, database_name, schema_name, table_name, column_name, rule_type, rule_params, status) VALUES (%s, %s, %s, %s, %s, %s, %s, 'Active')" if DATABASE_URL else "INSERT INTO rules (platform, database_name, schema_name, table_name, column_name, rule_type, rule_params, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')"
                cursor.execute(ins_q, (request.platform, request.database_name, request.schema_name, request.table_name, rule.column_name, rule.rule_type, rule_params_str))
                
        conn.commit()
        return {"status": "success", "message": f"Successfully applied {len(request.rules)} rules."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/v1/ai/chat")
async def ai_chat(request: AIChatRequest):
    try:
        context_table = request.context_table or "Unknown"
        from core.prompts import AI_AGENT_SYSTEM_PROMPT
        
        system_prompt = AI_AGENT_SYSTEM_PROMPT
        if context_table != "Unknown":
            system_prompt += f"\n\nContext Note: The user is currently analyzing the table: {context_table}."
        sql_query = QueryGenerator.generate_chat_agent_sql(request.platform, system_prompt, request.messages)
        result = None
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            try:
                result = snowflake_engine.execute_query(sql_query)
                ai_response = result[0].get('ai_response') or result[0].get('AI_RESPONSE') if result else "I couldn't process that request."
            except Exception as sql_err:
                error_str = str(sql_err)
                if "399258" in error_str or "trial account" in error_str.lower():
                    # Fallback for Snowflake Trial Accounts where Cortex is disabled
                    last_user_msg = next((m.get("text", "").lower() for m in reversed(request.messages) if m.get("role") == "user"), "")
                    
                    # Check if the user mentioned a specific table
                    mentioned_table = None
                    words = last_user_msg.split()
                    for idx, word in enumerate(words):
                        if word == "table" and idx > 0:
                            mentioned_table = words[idx-1].upper().strip("'\"`")
                    
                    target_table = mentioned_table if mentioned_table else context_table

                    if last_user_msg in ["hi", "hello", "hey"]:
                        context_phrase = f"I see you have the `{context_table}` table selected." if context_table != "Unknown" else "I can analyze your tables."
                        ai_response = f"Hello! I am Bris AI, your Data Quality Intelligence Agent. \n\n*Note: Your Snowflake account is currently a Trial Account, which has Cortex AI disabled. I am running in local simulation mode.* \n\n{context_phrase} How can I help you investigate data quality or build rules today?"
                    elif "list" in last_user_msg and "tables" in last_user_msg:
                        # Attempt to extract database name
                        db_name = None
                        if "in " in last_user_msg:
                            parts = last_user_msg.split("in ")
                            if len(parts) > 1:
                                db_name = parts[1].split()[0].upper().strip("?'\"`")
                        
                        if db_name:
                            try:
                                # Execute actual SQL metadata query using the existing connection
                                df = snowflake_engine.execute_query(f"SHOW TABLES IN DATABASE {db_name}")
                                if not df.empty:
                                    table_names = df['name'].tolist() if 'name' in df.columns else df.iloc[:, 1].tolist()
                                    table_list_str = "\n".join([f"- `{t}`" for t in table_names])
                                    ai_response = f"Here are the tables in `{db_name}`:\n\n{table_list_str}\n\n*(Note: This is actual metadata fetched via Snowflake SQL, bypassing Cortex AI due to Trial Account restrictions)*"
                                else:
                                    ai_response = f"I executed a query against `{db_name}`, but no tables were found or the database does not exist."
                            except Exception as e:
                                ai_response = f"I tried to list tables in `{db_name}`, but encountered an error: {str(e)}"
                        else:
                            ai_response = "I see you want to list tables, but I couldn't determine the database name from your prompt. E.g. 'Can you list all tables in DQ_DB?'"
                    else:
                        ai_response = f"""Summary
- Simulated analysis for `{target_table}` completed.
- *Note: Snowflake Cortex AI is disabled on your Trial Account.*

Details
- Identified potential issues based on standard table heuristics.
- Your query requested analysis on: "{last_user_msg}"

Root Cause
- Missing data patterns typically stem from upstream ETL mapping failures.

Recommendation
- Apply standard Completeness and Uniqueness rules to primary keys.

Actions
- [Apply Completeness Rule]
- [View Lineage]"""
                else:
                    raise sql_err
            finally:
                snowflake_engine.disconnect()
        elif request.platform == "databricks":
            databricks_engine.connect(request.credentials)
            result = databricks_engine.execute_query(sql_query)
            databricks_engine.disconnect()
        if 'ai_response' not in locals():
            ai_response = result[0].get('ai_response') or result[0].get('AI_RESPONSE') if result else "I couldn't process that request."
        
        return {"status": "success", "platform": request.platform, "response": ai_response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/ai/test")
async def ai_test(request: CatalogRequest):
    try:
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            sql = "SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large', 'Say hello') AS ai_response"
            result = snowflake_engine.execute_query(sql)
            snowflake_engine.disconnect()
            return {"status": "success", "response": result}
        return {"status": "error", "detail": "Test only implemented for Snowflake"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

import json

@app.post("/api/v1/metadata/save")
async def save_catalog_metadata(request: SaveMetadataRequest):
    try:
        if not request.credentials:
            raise HTTPException(status_code=400, detail="Missing credentials for warehouse pushdown")
            
        import json
        terms_str = json.dumps(request.terms) if request.terms else "[]"
        db = request.database_name or "PUBLIC"
        sch = request.schema_name or "PUBLIC"
        
        table_path = f'"{db.upper()}"."{sch.upper()}".DATA_CATALOG_METADATA' if request.platform == "snowflake" else f"`{db}`.`{sch}`.DATA_CATALOG_METADATA"
        log_path = f'"{db.upper()}"."{sch.upper()}".METADATA_OPERATIONS_LOG' if request.platform == "snowflake" else f"`{db}`.`{sch}`.METADATA_OPERATIONS_LOG"
        
        create_table_sql = f'''
            CREATE TABLE IF NOT EXISTS {table_path} (
                TABLE_NAME VARCHAR,
                COLUMN_NAME VARCHAR,
                DESCRIPTION VARCHAR,
                TERMS VARCHAR,
                IS_AUTO_GENERATED BOOLEAN,
                UPDATED_BY VARCHAR,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
            )
        '''
        
        create_audit_sql = f'''
            CREATE TABLE IF NOT EXISTS {log_path} (
                ACTION VARCHAR,
                TABLE_NAME VARCHAR,
                COLUMN_NAME VARCHAR,
                DESCRIPTION VARCHAR,
                TERMS VARCHAR,
                UPDATED_BY VARCHAR,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
            )
        '''

        safe_desc = request.description.replace("'", "''") if request.description else ""
        safe_terms = terms_str.replace("'", "''")
        
        merge_sql = f'''
            MERGE INTO {table_path} AS target
            USING (
                SELECT 
                    '{request.table_name}' AS TABLE_NAME,
                    '{request.column_name}' AS COLUMN_NAME,
                    '{safe_desc}' AS DESCRIPTION,
                    '{safe_terms}' AS TERMS,
                    {str(bool(request.is_auto_generated)).upper()} AS IS_AUTO_GENERATED,
                    'current_user' AS UPDATED_BY
            ) AS source
            ON target.TABLE_NAME = source.TABLE_NAME AND target.COLUMN_NAME = source.COLUMN_NAME
            WHEN MATCHED THEN
                UPDATE SET 
                    target.DESCRIPTION = source.DESCRIPTION,
                    target.TERMS = source.TERMS,
                    target.IS_AUTO_GENERATED = source.IS_AUTO_GENERATED,
                    target.UPDATED_BY = source.UPDATED_BY,
                    target.UPDATED_AT = CURRENT_TIMESTAMP()
            WHEN NOT MATCHED THEN
                INSERT (TABLE_NAME, COLUMN_NAME, DESCRIPTION, TERMS, IS_AUTO_GENERATED, UPDATED_BY)
                VALUES (source.TABLE_NAME, source.COLUMN_NAME, source.DESCRIPTION, source.TERMS, source.IS_AUTO_GENERATED, source.UPDATED_BY)
        '''

        audit_sql = f'''
            INSERT INTO {log_path}
            (ACTION, TABLE_NAME, COLUMN_NAME, DESCRIPTION, TERMS, UPDATED_BY)
            VALUES (
                'SAVE_METADATA',
                '{request.table_name}',
                '{request.column_name}',
                '{safe_desc}',
                '{safe_terms}',
                'current_user'
            )
        '''

        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            snowflake_engine.execute_query(create_table_sql)
            snowflake_engine.execute_query(create_audit_sql)
            snowflake_engine.execute_query(merge_sql)
            snowflake_engine.execute_query(audit_sql)
            snowflake_engine.disconnect()
        elif request.platform == "databricks":
            databricks_engine.connect(request.credentials)
            databricks_engine.execute_query(create_table_sql)
            databricks_engine.execute_query(create_audit_sql)
            databricks_engine.execute_query(merge_sql)
            databricks_engine.execute_query(audit_sql)
            databricks_engine.disconnect()
        else:
            raise HTTPException(status_code=400, detail="Unsupported platform")

        return {"status": "success", "message": "Metadata saved successfully"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to save metadata: {str(e)}")

@app.post("/api/v1/metadata/fetch")
async def fetch_catalog_metadata(request: FetchMetadataRequest):
    try:
        if not request.credentials:
            return {"status": "success", "description": "", "terms": [], "is_auto_generated": False}
            
        import json
        db = request.database_name or "PUBLIC"
        sch = request.schema_name or "PUBLIC"
        
        table_path = f'"{db.upper()}"."{sch.upper()}".DATA_CATALOG_METADATA' if request.platform == "snowflake" else f"`{db}`.`{sch}`.DATA_CATALOG_METADATA"
        
        create_table_sql = f'''
            CREATE TABLE IF NOT EXISTS {table_path} (
                TABLE_NAME VARCHAR,
                COLUMN_NAME VARCHAR,
                DESCRIPTION VARCHAR,
                TERMS VARCHAR,
                IS_AUTO_GENERATED BOOLEAN,
                UPDATED_BY VARCHAR,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
            )
        '''
        
        fetch_sql = f'''
            SELECT DESCRIPTION, TERMS, IS_AUTO_GENERATED, UPDATED_AT AS LAST_UPDATED
            FROM {table_path}
            WHERE TABLE_NAME = '{request.table_name}' AND COLUMN_NAME = '{request.column_name}'
        '''

        result = None
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            snowflake_engine.execute_query(create_table_sql)
            result = snowflake_engine.execute_query(fetch_sql)
            snowflake_engine.disconnect()
        elif request.platform == "databricks":
            databricks_engine.connect(request.credentials)
            databricks_engine.execute_query(create_table_sql)
            result = databricks_engine.execute_query(fetch_sql)
            databricks_engine.disconnect()
        else:
            raise HTTPException(status_code=400, detail="Unsupported platform")
            
        if result and len(result) > 0:
            row = {k.lower(): v for k, v in result[0].items()}
            terms_arr = []
            if row.get('terms'):
                try:
                    terms_arr = json.loads(row['terms'])
                except:
                    pass
            return {
                "status": "success",
                "description": row.get('description', ''),
                "terms": terms_arr,
                "is_auto_generated": bool(row.get('is_auto_generated', False)),
                "last_updated": row.get('last_updated')
            }
        else:
            return {"status": "success", "description": "", "terms": [], "is_auto_generated": False}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to fetch metadata: {str(e)}")

@app.post("/api/v1/metadata/fetch-all")
async def fetch_all_catalog_metadata(request: FetchAllMetadataRequest):
    try:
        if not request.credentials or not request.database_name or not request.schema_name:
            return {"status": "success", "metadata": {}}
            
        import json
        db = request.database_name
        sch = request.schema_name
        
        table_path = f'"{db.upper()}"."{sch.upper()}".DATA_CATALOG_METADATA' if request.platform == "snowflake" else f"`{db}`.`{sch}`.DATA_CATALOG_METADATA"
        
        create_table_sql = f'''
            CREATE TABLE IF NOT EXISTS {table_path} (
                TABLE_NAME VARCHAR,
                COLUMN_NAME VARCHAR,
                DESCRIPTION VARCHAR,
                TERMS VARCHAR,
                IS_AUTO_GENERATED BOOLEAN,
                UPDATED_BY VARCHAR,
                UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
            )
        '''
        
        fetch_sql = f'''
            SELECT TABLE_NAME, DESCRIPTION, TERMS, IS_AUTO_GENERATED, UPDATED_AT AS LAST_UPDATED
            FROM {table_path}
            WHERE COLUMN_NAME = ''
        '''
        
        result = None
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            snowflake_engine.execute_query(create_table_sql)
            result = snowflake_engine.execute_query(fetch_sql)
            snowflake_engine.disconnect()
        elif request.platform == "databricks":
            databricks_engine.connect(request.credentials)
            databricks_engine.execute_query(create_table_sql)
            result = databricks_engine.execute_query(fetch_sql)
            databricks_engine.disconnect()

        metadata_map = {}
        if result:
            for row in result:
                row_norm = {k.lower(): v for k, v in row.items()}
                t_name = row_norm.get('table_name', '')
                terms_arr = []
                if row_norm.get('terms'):
                    try:
                        terms_arr = json.loads(row_norm['terms'])
                    except:
                        pass
                
                metadata_map[t_name] = {
                    "description": row_norm.get('description', ''),
                    "terms": terms_arr,
                    "is_auto_generated": bool(row_norm.get('is_auto_generated', False)),
                    "last_updated": row_norm.get('last_updated')
                }
                
        return {"status": "success", "metadata": metadata_map}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to fetch all metadata: {str(e)}")


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
                        col_name = row.get('column_name') or row.get('COLUMN_NAME')
                        col_type = row.get('data_type') or row.get('DATA_TYPE')
                        is_null = row.get('is_nullable') or row.get('IS_NULLABLE')
                        entities.append({"name": col_name, "type": col_type, "nullable": is_null == 'YES'})
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
            mapped = []
            if result:
                for r in result:
                    # DictCursor might return lowercase or uppercase keys
                    kind = r.get("kind") or r.get("KIND") or r.get("TYPE")
                    if kind == "TABLE":
                        db = r.get("database_name") or r.get("DATABASE_NAME") or r.get("DATABASE")
                        if db and db.upper() not in ('SNOWFLAKE', 'SNOWFLAKE_SAMPLE_DATA'):
                            mapped.append({
                                "DATABASE": db,
                                "SCHEMA": r.get("schema_name") or r.get("SCHEMA_NAME") or r.get("SCHEMA"),
                                "NAME": r.get("name") or r.get("NAME"),
                                "TYPE": "TABLE",
                                "RECORDS": r.get("rows") or r.get("ROWS") or r.get("RECORDS") or 0,
                                "ATTRIBUTES": 0
                            })
            result = mapped
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
            mapped = []
            if result:
                for r in result:
                    # DictCursor might return lowercase or uppercase keys
                    kind = r.get("kind") or r.get("KIND") or r.get("TYPE")
                    if kind == "TABLE":
                        db = r.get("database_name") or r.get("DATABASE_NAME") or r.get("DATABASE")
                        if db and db.upper() not in ('SNOWFLAKE', 'SNOWFLAKE_SAMPLE_DATA'):
                            mapped.append({
                                "DATABASE": db,
                                "SCHEMA": r.get("schema_name") or r.get("SCHEMA_NAME") or r.get("SCHEMA"),
                                "NAME": r.get("name") or r.get("NAME"),
                                "TYPE": "TABLE",
                                "RECORDS": r.get("rows") or r.get("ROWS") or r.get("RECORDS") or 0,
                                "ATTRIBUTES": 0
                            })
            result = mapped
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



# ── Lightweight summary endpoint (used by old code paths) ──────────────────
@app.get("/api/v1/dashboard/invalid_records")
async def get_invalid_records(table_name: str):
    """Return aggregated failed-rows counts from local DB."""
    conn, cursor = get_db_connection()
    try:
        ph = "%s" if DATABASE_URL else "?"
        cursor.execute(
            f"SELECT column_name, rule_type, failed_rows, status FROM rule_executions WHERE table_name = {ph} AND failed_rows > 0",
            (table_name,)
        )
        rows = cursor.fetchall()
        records = [dict(row) for row in rows]
        return {"status": "success", "records": records}
    except Exception as e:
        print(f"Error fetching invalid records: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


class FailedCheckItem(BaseModel):
    column_name: str
    rule_type: str   # 'Null Check' | 'Unique Check' (or their _CHECK variants)

class SampleFailedRecordsRequest(BaseModel):
    platform: str
    table_name: str
    failed_checks: list[FailedCheckItem]
    credentials: Optional[Dict[str, Any]] = None


@app.post("/api/v1/dashboard/sample_failed_records")
async def sample_failed_records(request: SampleFailedRecordsRequest):
    """
    For each failed DQ check (Unique / Null), run a live Snowflake query that
    returns up to 5 sample rows that caused the failure.

    Response shape:
    {
      "status": "success",
      "groups": [
        {
          "column_name": "FIRST_NAME",
          "rule_type": "Unique Check",
          "columns": ["ATTRIBUTE_NAME", "DQ_CHECK", "ACTOR_ID", "FIRST_NAME", ...],
          "rows": [["FIRST_NAME", "Unique Check", 1, "NICK", ...], ...]
        },
        ...
      ]
    }
    """
    groups = []

    if request.platform != "snowflake":
        # Databricks support can be added later
        return {"status": "success", "groups": []}

    creds = request.credentials or {}
    try:
        snowflake_engine.connect(creds)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Snowflake connection failed: {e}")

    try:
        for check in request.failed_checks:
            col = check.column_name
            rule = check.rule_type.upper()

            if "UNIQUE" in rule:
                sql = f"""
                    SELECT
                        '{col}' AS ATTRIBUTE_NAME,
                        'Unique Check' AS DQ_CHECK,
                        a.*
                    FROM {request.table_name} a
                    JOIN (
                        SELECT {col}
                        FROM {request.table_name}
                        GROUP BY {col}
                        HAVING COUNT(*) > 1
                    ) d
                    ON a.{col} = d.{col}
                    ORDER BY a.{col}
                    LIMIT 5
                """
            elif "NULL" in rule:
                sql = f"""
                    SELECT
                        '{col}' AS ATTRIBUTE_NAME,
                        'Null Check' AS DQ_CHECK,
                        *
                    FROM {request.table_name}
                    WHERE {col} IS NULL
                    LIMIT 5
                """
            else:
                # Skip unsupported rule types for now
                continue

            try:
                raw_rows = snowflake_engine.execute_query(sql)
                if not raw_rows:
                    continue
                # DictCursor returns list of dicts – normalise to lower-case keys
                columns = [k.lower() for k in raw_rows[0].keys()]
                rows = [[str(row[k]) for k in raw_rows[0].keys()] for row in raw_rows]
                groups.append({
                    "column_name": col,
                    "rule_type": "Unique Check" if "UNIQUE" in rule else "Null Check",
                    "columns": columns,
                    "rows": rows
                })
            except Exception as e:
                print(f"Sample query failed for {col} / {rule}: {e}")
                # Continue with remaining checks even if one fails
                continue
    finally:
        snowflake_engine.disconnect()

    return {"status": "success", "groups": groups}

@app.post("/api/v1/dashboard/executions")
async def log_dashboard_executions(request: ExecutionLogRequest):
    import datetime
    run_start = datetime.datetime.utcnow()
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

        # ── Build and persist a run-level summary row in dq_run_history ──────
        if request.executions:
            total_rows_agg   = max((ex.total_rows for ex in request.executions), default=0)
            failed_rows_agg  = sum(ex.failed_rows for ex in request.executions)
            passed_rows_agg  = total_rows_agg - failed_rows_agg
            # Score = average across all rule scores
            scores = [
                round((1 - ex.failed_rows / ex.total_rows) * 100, 1) if ex.total_rows > 0 else 100
                for ex in request.executions
            ]
            dq_score = round(sum(scores) / len(scores), 1) if scores else 100

            if failed_rows_agg == 0:
                run_status = 'Passed'
            elif passed_rows_agg == 0:
                run_status = 'Failed'
            else:
                run_status = 'Partially Passed'

            run_end = datetime.datetime.utcnow()
            duration_ms = int((run_end - run_start).total_seconds() * 1000)
            run_date = run_end.strftime('%Y-%m-%d')
            run_time = run_end.strftime('%H:%M:%S UTC')

            history_query = """
                INSERT INTO dq_run_history
                    (table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """ if DATABASE_URL else """
                INSERT INTO dq_run_history
                    (table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            cursor.execute(history_query, (
                request.table_name, run_date, run_time, dq_score,
                total_rows_agg, passed_rows_agg, failed_rows_agg,
                run_status, request.executed_by or 'User', duration_ms
            ))

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


@app.post("/api/v1/dashboard/warehouse_analytics")
async def get_dashboard_warehouse_analytics(request: DashboardRequest):
    try:
        platform = request.platform.lower()
        creds = request.credentials or {}
        
        # Connect to the platform
        if platform == "snowflake":
            snowflake_engine.connect(creds)
        elif platform == "databricks":
            databricks_engine.connect(creds)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported platform: {platform}")
        
        queries = []
        # Attempt to fetch query history
        try:
            if platform == "snowflake":
                # Try table query history first
                try:
                    sql = "SELECT QUERY_TEXT FROM TABLE(INFORMATION_SCHEMA.QUERY_HISTORY(RESULT_LIMIT => 500)) ORDER BY START_TIME DESC"
                    queries = snowflake_engine.execute_query(sql)
                except Exception:
                    sql = "SELECT QUERY_TEXT FROM TABLE(INFORMATION_SCHEMA.QUERY_HISTORY_BY_SESSION(RESULT_LIMIT => 500)) ORDER BY START_TIME DESC"
                    queries = snowflake_engine.execute_query(sql)
            elif platform == "databricks":
                sql = "SELECT statement_text as QUERY_TEXT FROM system.query.history ORDER BY start_time DESC LIMIT 500"
                queries = databricks_engine.execute_query(sql)
        except Exception as q_err:
            print(f"Query history retrieval failed, falling back: {q_err}")
            queries = []
            
        # Disconnect engine
        if platform == "snowflake":
            snowflake_engine.disconnect()
        elif platform == "databricks":
            databricks_engine.disconnect()
            
        # Analyze queries if we found any
        top_table_name = None
        reads_count = 0
        
        if queries:
            analytics = UsageAnalyzer.analyze_queries(queries)
            top_tables = analytics.get("top_tables", [])
            if top_tables:
                top_table_name = top_tables[0]["name"]
                reads_count = top_tables[0]["count"]
                
        # If no top table found via query history, fall back to local database or SHOW TABLES
        if not top_table_name:
            conn, cursor = get_db_connection()
            try:
                cursor.execute("SELECT table_name FROM dq_run_history ORDER BY id DESC LIMIT 1")
                row = cursor.fetchone()
                if row:
                    top_table_name = row['table_name']
                else:
                    cursor.execute("SELECT table_name FROM rules LIMIT 1")
                    row = cursor.fetchone()
                    if row:
                        top_table_name = row['table_name']
            except Exception as db_err:
                print(f"Error querying local DB for fallback table: {db_err}")
            finally:
                conn.close()
                
        # If still no table, try remote SHOW TABLES
        if not top_table_name:
            try:
                if platform == "snowflake":
                    snowflake_engine.connect(creds)
                    try:
                        res = snowflake_engine.execute_query("SHOW TABLES LIMIT 1")
                        if res:
                            top_table_name = res[0].get('name') or res[0].get('NAME')
                    except Exception:
                        pass
                    snowflake_engine.disconnect()
                elif platform == "databricks":
                    databricks_engine.connect(creds)
                    try:
                        res = databricks_engine.execute_query("SHOW TABLES LIMIT 1")
                        if res:
                            top_table_name = res[0].get('tableName') or res[0].get('tableName'.upper())
                    except Exception:
                        pass
                    databricks_engine.disconnect()
            except Exception as remote_err:
                print(f"Error querying remote DB for fallback: {remote_err}")
                
        # Final fallback
        if not top_table_name:
            top_table_name = "N/A"
            reads_count = 0
            dq_score = 100.0
        else:
            # Query local DB for the DQ score of this table
            dq_score = 100.0
            short_name = top_table_name.split('.')[-1]
            conn, cursor = get_db_connection()
            try:
                cursor.execute(
                    "SELECT dq_score FROM dq_run_history WHERE LOWER(table_name) = ? OR LOWER(table_name) = ? ORDER BY id DESC LIMIT 1",
                    (top_table_name.lower(), short_name.lower())
                )
                row = cursor.fetchone()
                if row:
                    dq_score = row['dq_score']
            except Exception as db_err:
                print(f"Error fetching DQ score: {db_err}")
            finally:
                conn.close()
                
        return {
            "status": "success",
            "table_name": top_table_name,
            "reads": reads_count,
            "dq_score": dq_score
        }
    except Exception as e:
        import traceback
        print(f"Warehouse analytics failed: {traceback.format_exc()}")
        return {
            "status": "success",
            "table_name": "No active table",
            "reads": 0,
            "dq_score": 100.0
        }


@app.post("/api/v1/dashboard/query_logs")
async def get_dashboard_query_logs(request: DashboardRequest):
    try:
        platform = request.platform.lower()
        creds = request.credentials or {}
        
        # Connect to the platform
        if platform == "snowflake":
            snowflake_engine.connect(creds)
        elif platform == "databricks":
            databricks_engine.connect(creds)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported platform: {platform}")
            
        raw_queries = []
        try:
            if platform == "snowflake":
                try:
                    sql = """
                    SELECT 
                        QUERY_TEXT, 
                        USER_NAME, 
                        START_TIME, 
                        TOTAL_ELAPSED_TIME
                    FROM TABLE(INFORMATION_SCHEMA.QUERY_HISTORY(RESULT_LIMIT => 10))
                    ORDER BY START_TIME DESC
                    """
                    raw_queries = snowflake_engine.execute_query(sql)
                except Exception:
                    sql = """
                    SELECT 
                        QUERY_TEXT, 
                        USER_NAME, 
                        START_TIME, 
                        TOTAL_ELAPSED_TIME
                    FROM TABLE(INFORMATION_SCHEMA.QUERY_HISTORY_BY_SESSION(RESULT_LIMIT => 10))
                    ORDER BY START_TIME DESC
                    """
                    raw_queries = snowflake_engine.execute_query(sql)
            elif platform == "databricks":
                sql = """
                SELECT 
                    statement_text as QUERY_TEXT, 
                    executed_by as USER_NAME, 
                    start_time as START_TIME, 
                    duration as TOTAL_ELAPSED_TIME
                FROM system.query.history 
                ORDER BY start_time DESC 
                LIMIT 10
                """
                raw_queries = databricks_engine.execute_query(sql)
        except Exception as q_err:
            print(f"Query logs retrieval failed, falling back: {q_err}")
            raw_queries = []
            
        # Disconnect engine
        if platform == "snowflake":
            snowflake_engine.disconnect()
        elif platform == "databricks":
            databricks_engine.disconnect()
            
        formatted_logs = []
        for row in raw_queries:
            q_text = row.get("QUERY_TEXT") or row.get("query_text") or ""
            user_name = row.get("USER_NAME") or row.get("user_name") or "Unknown"
            
            # Format duration
            duration_val = row.get("TOTAL_ELAPSED_TIME") or row.get("total_elapsed_time") or 0
            if duration_val < 1000:
                duration_str = f"{int(duration_val)}ms"
            else:
                duration_str = f"{duration_val / 1000:.1f}s"
                
            formatted_logs.append({
                "query": q_text,
                "user": user_name,
                "duration": duration_str
            })
            
        return {
            "status": "success",
            "queries": formatted_logs
        }
    except Exception as e:
        print(f"Query logs failed: {e}")
        return {
            "status": "success",
            "queries": []
        }


@app.post("/api/v1/dashboard/lineage")
async def get_dashboard_lineage(request: DashboardRequest):
    platform = request.platform.lower()
    creds = request.credentials or {}
    
    # Establish connection
    try:
        if platform == "snowflake":
            snowflake_engine.connect(creds)
        elif platform == "databricks":
            databricks_engine.connect(creds)
        else:
            return {"status": "success", "nodes": [], "edges": []}
    except Exception as conn_err:
        print(f"Lineage connection failed: {conn_err}")
        return {"status": "success", "nodes": [], "edges": []}
        
    try:
        # Determine database & schema
        db_name = creds.get("database")
        schema_name = creds.get("schema")
        
        if not db_name or not schema_name:
            try:
                if platform == "snowflake":
                    res = snowflake_engine.execute_query("SELECT CURRENT_DATABASE() as DB, CURRENT_SCHEMA() as SCH")
                    if res:
                        db_name = res[0].get("DB") or res[0].get("db")
                        schema_name = res[0].get("SCH") or res[0].get("sch")
                elif platform == "databricks":
                    res = databricks_engine.execute_query("SELECT CURRENT_CATALOG() as DB, CURRENT_SCHEMA() as SCH")
                    if res:
                        db_name = res[0].get("DB") or res[0].get("db")
                        schema_name = res[0].get("SCH") or res[0].get("sch")
            except Exception as ctx_err:
                print(f"Error querying active DB context: {ctx_err}")
                
        # If still not found, try to list catalogs and get first catalog/schema
        if not db_name or not schema_name:
            try:
                if platform == "snowflake":
                    dbs = snowflake_engine.execute_query("SHOW DATABASES LIMIT 1")
                    if dbs:
                        db_name = dbs[0].get("name") or dbs[0].get("NAME")
                        schs = snowflake_engine.execute_query(f"SHOW SCHEMAS IN DATABASE {db_name} LIMIT 1")
                        if schs:
                            schema_name = schs[0].get("name") or schs[0].get("NAME")
                elif platform == "databricks":
                    dbs = databricks_engine.execute_query("SHOW CATALOGS LIMIT 1")
                    if dbs:
                        db_name = dbs[0].get("catalog") or dbs[0].get("CATALOG")
                        schs = databricks_engine.execute_query(f"SHOW SCHEMAS IN {db_name} LIMIT 1")
                        if schs:
                            schema_name = schs[0].get("databaseName") or schs[0].get("DATABASE_NAME")
            except Exception as fallback_err:
                print(f"Lineage database/schema fallback failed: {fallback_err}")
                
        if not db_name or not schema_name:
            print("No active database and schema found for lineage inference.")
            return {"status": "success", "nodes": [], "edges": []}
            
        # Generate the SQL to fetch columns from information schema
        sql_query = QueryGenerator.generate_information_schema_sql(platform, db_name, schema_name)
        columns = snowflake_engine.execute_query(sql_query) if platform == "snowflake" else databricks_engine.execute_query(sql_query)
        
        # Infer lineage relationships using LineageEngine
        lineage_graph = LineageEngine.infer_relationships(columns)
        return {
            "status": "success",
            "nodes": lineage_graph.get("nodes", []),
            "edges": lineage_graph.get("edges", []),
            "database": db_name,
            "schema": schema_name
        }
    except Exception as e:
        print(f"Lineage endpoint failed: {e}")
        return {"status": "success", "nodes": [], "edges": []}
    finally:
        if platform == "snowflake":
            snowflake_engine.disconnect()
        elif platform == "databricks":
            databricks_engine.disconnect()


@app.get("/api/v1/dashboard/run_history")
async def get_run_history(table_name: str):
    """Return all historical DQ runs for a table, newest first."""
    conn, cursor = get_db_connection()
    try:
        ph = "%s" if DATABASE_URL else "?"
        cursor.execute(
            f"""
            SELECT id, table_name, run_date, run_time, dq_score,
                   total_rows, passed_rows, failed_rows, status,
                   executed_by, duration_ms, executed_at
            FROM dq_run_history
            WHERE table_name = {ph}
            ORDER BY id DESC
            """,
            (table_name,)
        )
        rows = cursor.fetchall()
        history = [dict(r) for r in rows]
        return {"status": "success", "history": history}
    except Exception as e:
        print(f"Error fetching run history: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
# ──────────────────────────────────────────────────────────────────────
# AUTOMATED SCHEDULING SYSTEM
# ──────────────────────────────────────────────────────────────────────

import datetime
import json
import traceback
import threading
import time

def parse_iso_or_time(time_str: str) -> datetime.time:
    try:
        if "T" in time_str:
            dt = datetime.datetime.fromisoformat(time_str.replace("Z", ""))
            return dt.time()
        parts = time_str.split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        s = int(parts[2]) if len(parts) > 2 else 0
        return datetime.time(h, m, s)
    except:
        return datetime.time(0, 0, 0)

def calculate_next_run_time(frequency: str, custom_config_str: Optional[str], start_time_str: str, timezone_str: Optional[str] = "UTC", last_run_dt: Optional[datetime.datetime] = None) -> Optional[datetime.datetime]:
    current_utc = datetime.datetime.utcnow()
    
    if frequency in ("Disabled", "Not Scheduled", ""):
        return None
        
    presets = {
        "5 minutes": datetime.timedelta(minutes=5),
        "10 minutes": datetime.timedelta(minutes=10),
        "20 minutes": datetime.timedelta(minutes=20),
        "30 minutes": datetime.timedelta(minutes=30),
        "1 hour": datetime.timedelta(hours=1),
        "4 hours": datetime.timedelta(hours=4),
        "6 hours": datetime.timedelta(hours=6),
        "12 hours": datetime.timedelta(hours=12),
        "24 hours": datetime.timedelta(hours=24)
    }
    
    if frequency in presets:
        delta = presets[frequency]
        if last_run_dt:
            return last_run_dt + delta
        else:
            try:
                start_dt = datetime.datetime.fromisoformat(start_time_str.replace("Z", ""))
                if start_dt > current_utc:
                    return start_dt
            except:
                pass
            return current_utc + delta

    if frequency == "Other" and custom_config_str:
        try:
            config = json.loads(custom_config_str)
            unit = config.get("type")
            val = int(config.get("value", 1))
            
            if unit == "minutes":
                base = last_run_dt or current_utc
                return base + datetime.timedelta(minutes=val)
            elif unit == "hours":
                base = last_run_dt or current_utc
                return base + datetime.timedelta(hours=val)
            elif unit == "days":
                base = last_run_dt or current_utc
                return base + datetime.timedelta(days=val)
            
            elif unit == "weekly":
                target_days = config.get("days", [])
                interval = int(config.get("interval", 1))
                t = parse_iso_or_time(start_time_str)
                start_search = last_run_dt + datetime.timedelta(minutes=1) if last_run_dt else current_utc
                
                day_map = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
                target_wdays = [day_map[d.lower()] for d in target_days if d.lower() in day_map]
                if not target_wdays:
                    target_wdays = [0]
                
                for i in range(1, 30):
                    candidate = start_search + datetime.timedelta(days=i)
                    if candidate.weekday() in target_wdays:
                        next_dt = datetime.datetime.combine(candidate.date(), t)
                        if next_dt > current_utc:
                            return next_dt
                return current_utc + datetime.timedelta(days=7 * interval)
                
            elif unit == "monthly":
                mode = config.get("mode", "date")
                t = parse_iso_or_time(start_time_str)
                start_search = last_run_dt + datetime.timedelta(minutes=1) if last_run_dt else current_utc
                
                if mode == "date":
                    day_of_month = int(config.get("date", 1))
                    for m_offset in range(12):
                        year = start_search.year
                        month = start_search.month + m_offset
                        while month > 12:
                            month -= 12
                            year += 1
                        try:
                            candidate_date = datetime.date(year, month, day_of_month)
                            next_dt = datetime.datetime.combine(candidate_date, t)
                            if next_dt > current_utc:
                                return next_dt
                        except ValueError:
                            pass
                else:
                    index = int(config.get("index", 1))
                    day_name = config.get("day", "Monday")
                    day_map = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
                    target_wday = day_map.get(day_name.lower(), 0)
                    
                    for m_offset in range(12):
                        year = start_search.year
                        month = start_search.month + m_offset
                        while month > 12:
                            month -= 12
                            year += 1
                            
                        matching_dates = []
                        for d in range(1, 32):
                            try:
                                dt = datetime.date(year, month, d)
                                if dt.weekday() == target_wday:
                                    matching_dates.append(dt)
                            except ValueError:
                                break
                        
                        if matching_dates:
                            if index == -1:
                                target_date = matching_dates[-1]
                            else:
                                idx = min(index - 1, len(matching_dates) - 1)
                                target_date = matching_dates[idx]
                                
                            next_dt = datetime.datetime.combine(target_date, t)
                            if next_dt > current_utc:
                                return next_dt
            
        except Exception as e:
            print(f"Error calculating custom config scheduling: {e}")
            
    return current_utc + datetime.timedelta(days=1)


def execute_schedule_job(schedule_id: int):
    conn, cursor = get_db_connection()
    try:
        query = "SELECT * FROM schedules WHERE id = %s" if DATABASE_URL else "SELECT * FROM schedules WHERE id = ?"
        cursor.execute(query, (schedule_id,))
        schedule = cursor.fetchone()
        if not schedule or not schedule["enabled"]:
            return
            
        platform = schedule["platform"]
        db_name = schedule["database_name"]
        sch_name = schedule["schema_name"]
        tbl_name = schedule["table_name"]
        run_type = schedule["run_type"]
        frequency = schedule["frequency"]
        custom_config = schedule["custom_config"]
        start_time = schedule["start_time"]
        timezone = schedule["timezone"]
        
        engine = snowflake_engine if platform == "snowflake" else databricks_engine
        
    except Exception as e:
        print(f"Error initializing job {schedule_id}: {e}")
        return
    finally:
        conn.close()
        
    run_start = datetime.datetime.utcnow()
    
    try:
        # Connect using env credentials
        engine.connect(None)
        
        if run_type == "profile":
            sql_query = QueryGenerator.generate_metadata_sql(platform, 'columns', db_name, sch_name, tbl_name)
            result = engine.execute_query(sql_query)
            
            columns = []
            if result:
                if platform == "snowflake":
                    for row in result:
                        val = row.get('column_name') or row.get('COLUMN_NAME')
                        if val: columns.append(val)
                elif platform == "databricks":
                    for row in result:
                        val = row.get('col_name') or row.get('COL_NAME')
                        if val: columns.append(val)
            
            col_profiles = {}
            for col in columns:
                if not col:
                    continue
                prof_query = QueryGenerator.generate_profiling_sql(platform, db_name, sch_name, tbl_name, col)
                res = engine.execute_query(prof_query)
                if res:
                    raw = res[0]
                    normalized = {k.lower(): v for k, v in raw.items()} if raw else {}
                    col_profiles[col] = normalized
            
            count_query = f"SELECT COUNT(*) as row_count FROM {db_name}.{sch_name}.{tbl_name}"
            count_res = engine.execute_query(count_query)
            row_count = count_res[0].get('row_count') or count_res[0].get('ROW_COUNT') or 0
            
            conn_db, cursor_db = get_db_connection()
            try:
                profiles_json = json.dumps(col_profiles)
                if DATABASE_URL:
                    upsert_query = """
                        INSERT INTO column_profiles (platform, database_name, schema_name, table_name, profile_data, updated_at)
                        VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                        ON CONFLICT (platform, database_name, schema_name, table_name)
                        DO UPDATE SET profile_data = EXCLUDED.profile_data, updated_at = CURRENT_TIMESTAMP
                    """
                else:
                    upsert_query = """
                        INSERT OR REPLACE INTO column_profiles (platform, database_name, schema_name, table_name, profile_data, updated_at)
                        VALUES (?, ?, ?, ?, ?, datetime('now'))
                    """
                cursor_db.execute(upsert_query, (platform, db_name, sch_name, tbl_name, profiles_json))
                
                run_end = datetime.datetime.utcnow()
                duration_ms = int((run_end - run_start).total_seconds() * 1000)
                run_date = run_end.strftime('%Y-%m-%d')
                run_time = run_end.strftime('%H:%M:%S UTC')
                
                history_query = """
                    INSERT INTO dq_run_history
                        (table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """ if DATABASE_URL else """
                    INSERT INTO dq_run_history
                        (table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
                cursor_db.execute(history_query, (
                    tbl_name, run_date, run_time, 100.0,
                    row_count, row_count, 0,
                    'Passed', 'Scheduled', duration_ms
                ))
                conn_db.commit()
            finally:
                conn_db.close()
                
        elif run_type == "evaluate":
            conn_db, cursor_db = get_db_connection()
            rules = []
            try:
                query_rules = """
                    SELECT * FROM rules 
                    WHERE database_name = %s AND schema_name = %s AND table_name = %s AND status = 'Active'
                """ if DATABASE_URL else """
                    SELECT * FROM rules 
                    WHERE database_name = ? AND schema_name = ? AND table_name = ? AND status = 'Active'
                """
                cursor_db.execute(query_rules, (db_name, sch_name, tbl_name))
                rules = [dict(r) for r in cursor_db.fetchall()]
            finally:
                conn_db.close()
                
            executions = []
            for rule in rules:
                params = json.loads(rule["rule_params"]) if isinstance(rule["rule_params"], str) else (rule["rule_params"] or {})
                sql = QueryGenerator.generate_dq_rule_sql(
                    platform=platform,
                    table=f"{db_name}.{sch_name}.{tbl_name}",
                    column=rule["column_name"],
                    rule_type=rule["rule_type"],
                    rule_params=params
                )
                res = engine.execute_query(sql)
                if res and len(res) > 0:
                    first_row = res[0]
                    total_rows = first_row.get('TOTAL_ROWS') or first_row.get('total_rows') or 0
                    failed_rows = first_row.get('FAILED_ROWS') or first_row.get('failed_rows') or 0
                    status = 'pass' if failed_rows == 0 else 'fail'
                    executions.append({
                        "column_name": rule["column_name"],
                        "rule_type": rule["rule_type"],
                        "total_rows": total_rows,
                        "failed_rows": failed_rows,
                        "status": status
                    })
            
            if executions:
                conn_db, cursor_db = get_db_connection()
                try:
                    executions_data = []
                    for ex in executions:
                        executions_data.append((
                            platform, tbl_name, ex["column_name"], ex["rule_type"], ex["total_rows"], ex["failed_rows"], ex["status"]
                        ))
                        
                        if ex["failed_rows"] > 0:
                            msg_text = f"{tbl_name}: {ex['column_name']} column failed {ex['rule_type']}. {ex['failed_rows']} failed rows."
                            title_text = f"{ex['rule_type']} Failure"
                            if ex['rule_type'] in ('Null Check', 'NULL_CHECK'):
                                title_text = "Null Rate Violation"
                                msg_text = f"{tbl_name}: {ex['column_name']} column showed a sudden jump in nulls ({ex['failed_rows']} records)."
                            elif ex['rule_type'] in ('Unique Check', 'UNIQUE_CHECK'):
                                title_text = "Uniqueness Violation"
                                msg_text = f"{tbl_name}: {ex['column_name']} column has duplicates."
                                
                            check_anomaly = """
                                SELECT id FROM anomalies WHERE title = %s AND msg = %s AND status = 'Active'
                            """ if DATABASE_URL else """
                                SELECT id FROM anomalies WHERE title = ? AND msg = ? AND status = 'Active'
                            """
                            cursor_db.execute(check_anomaly, (title_text, msg_text))
                            if not cursor_db.fetchone():
                                cursor_db.execute(
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
                    cursor_db.executemany(execs_query, executions_data)
                    
                    total_rows_agg = max((ex["total_rows"] for ex in executions), default=0)
                    failed_rows_agg = sum(ex["failed_rows"] for ex in executions)
                    passed_rows_agg = total_rows_agg - failed_rows_agg
                    scores = [
                        round((1 - ex["failed_rows"] / ex["total_rows"]) * 100, 1) if ex["total_rows"] > 0 else 100
                        for ex in executions
                    ]
                    dq_score = round(sum(scores) / len(scores), 1) if scores else 100
                    
                    if failed_rows_agg == 0:
                        run_status = 'Passed'
                    elif passed_rows_agg == 0:
                        run_status = 'Failed'
                    else:
                        run_status = 'Partially Passed'
                        
                    run_end = datetime.datetime.utcnow()
                    duration_ms = int((run_end - run_start).total_seconds() * 1000)
                    run_date = run_end.strftime('%Y-%m-%d')
                    run_time = run_end.strftime('%H:%M:%S UTC')
                    
                    history_query = """
                        INSERT INTO dq_run_history
                            (table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """ if DATABASE_URL else """
                        INSERT INTO dq_run_history
                            (table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """
                    cursor_db.execute(history_query, (
                        tbl_name, run_date, run_time, dq_score,
                        total_rows_agg, passed_rows_agg, failed_rows_agg,
                        run_status, 'Scheduled', duration_ms
                    ))
                    conn_db.commit()
                finally:
                    conn_db.close()
                    
        conn_db, cursor_db = get_db_connection()
        try:
            next_run = calculate_next_run_time(frequency, custom_config, start_time, timezone, run_start)
            next_run_str = next_run.isoformat() if next_run else None
            
            update_query = """
                UPDATE schedules
                SET status = 'Active', last_run_time = %s, next_run_time = %s, last_error = NULL
                WHERE id = %s
            """ if DATABASE_URL else """
                UPDATE schedules
                SET status = 'Active', last_run_time = ?, next_run_time = ?, last_error = NULL
                WHERE id = ?
            """
            cursor_db.execute(update_query, (run_start.isoformat(), next_run_str, schedule_id))
            conn_db.commit()
        finally:
            conn_db.close()
            
    except Exception as e:
        err_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(f"Scheduled run failed for schedule {schedule_id}: {err_msg}")
        
        conn_db, cursor_db = get_db_connection()
        try:
            next_run = calculate_next_run_time(frequency, custom_config, start_time, timezone, run_start)
            next_run_str = next_run.isoformat() if next_run else None
            
            update_query = """
                UPDATE schedules
                SET status = 'Failed', last_run_time = %s, next_run_time = %s, last_error = %s
                WHERE id = %s
            """ if DATABASE_URL else """
                UPDATE schedules
                SET status = 'Failed', last_run_time = ?, next_run_time = ?, last_error = ?
                WHERE id = ?
            """
            cursor_db.execute(update_query, (run_start.isoformat(), next_run_str, str(e), schedule_id))
            
            run_end = datetime.datetime.utcnow()
            duration_ms = int((run_end - run_start).total_seconds() * 1000)
            run_date = run_end.strftime('%Y-%m-%d')
            run_time = run_end.strftime('%H:%M:%S UTC')
            
            history_query = """
                INSERT INTO dq_run_history
                    (table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """ if DATABASE_URL else """
                INSERT INTO dq_run_history
                    (table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            cursor_db.execute(history_query, (
                tbl_name, run_date, run_time, 0.0,
                0, 0, 0,
                'Failed', 'Scheduled', duration_ms
            ))
            
            anom_title = "Scheduled Run Failure"
            anom_msg = f"Scheduled {run_type} run failed for table {tbl_name}. Error: {str(e)}"
            insert_anom = """
                INSERT INTO anomalies (title, msg, type, status) VALUES (%s, %s, %s, %s)
            """ if DATABASE_URL else """
                INSERT INTO anomalies (title, msg, type, status) VALUES (?, ?, ?, ?)
            """
            cursor_db.execute(insert_anom, (anom_title, anom_msg, "failure", "Active"))
            
            conn_db.commit()
        finally:
            conn_db.close()
    finally:
        try:
            engine.disconnect()
        except:
            pass


"""
def check_and_trigger_schedules():
    import datetime
    current_utc = datetime.datetime.utcnow().isoformat()
    conn, cursor = get_db_connection()
    due_schedules = []
    try:
        query = "SELECT id FROM schedules WHERE enabled = 1 AND next_run_time IS NOT NULL AND next_run_time <= ?"
        if DATABASE_URL:
            query = "SELECT id FROM schedules WHERE enabled = 1 AND next_run_time IS NOT NULL AND next_run_time <= %s"
        cursor.execute(query, (current_utc,))
        due_schedules = [row["id"] for row in cursor.fetchall()]
    except Exception as e:
        print(f"Error checking due schedules: {e}")
    finally:
        conn.close()
        
    for schedule_id in due_schedules:
        t = threading.Thread(target=execute_schedule_job, args=(schedule_id,), daemon=True)
        t.start()


def start_scheduler():
    def loop():
        time.sleep(5)
        while True:
            try:
                check_and_trigger_schedules()
            except Exception as e:
                print(f"Background scheduler error: {e}")
            time.sleep(10)
            
    thread = threading.Thread(target=loop, daemon=True)
    thread.start()
    print("Background scheduler thread started successfully.")
"""

# Native Snowflake Scheduling Migration
# The Python-based orchestrator above has been deprecated.
# DQ Scheduling is now handled natively via Snowflake TASKS calling SP_RUN_DQ_JOB.


@app.get("/api/v1/dashboard/schedules")
async def get_schedules(table_name: str, platform: str = "snowflake", database_name: str = "UNICORN", schema_name: str = "DEV"):
    conn, cursor = get_db_connection()
    try:
        query = """
            SELECT * FROM schedules 
            WHERE database_name = %s AND schema_name = %s AND table_name = %s
        """ if DATABASE_URL else """
            SELECT * FROM schedules 
            WHERE database_name = ? AND schema_name = ? AND table_name = ?
        """
        cursor.execute(query, (database_name, schema_name, table_name))
        rows = cursor.fetchall()
        schedules = [dict(row) for row in rows]
        
        types_present = [s["run_type"] for s in schedules]
        for run_type in ["profile", "evaluate"]:
            if run_type not in types_present:
                insert_query = """
                    INSERT INTO schedules 
                        (platform, database_name, schema_name, table_name, run_type, frequency, custom_config, start_time, timezone, status, enabled)
                    VALUES (%s, %s, %s, %s, %s, %s, NULL, %s, %s, %s, 0)
                """ if DATABASE_URL else """
                    INSERT INTO schedules 
                        (platform, database_name, schema_name, table_name, run_type, frequency, custom_config, start_time, timezone, status, enabled)
                    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0)
                """
                start_time_str = datetime.datetime.utcnow().isoformat()
                cursor.execute(insert_query, (
                    platform, database_name, schema_name, table_name, run_type, "Disabled", start_time_str, "UTC", "Active"
                ))
                conn.commit()
                
        cursor.execute(query, (database_name, schema_name, table_name))
        rows = cursor.fetchall()
        schedules = [dict(row) for row in rows]
        
        return {"status": "success", "schedules": schedules}
    except Exception as e:
        print(f"Error fetching schedules: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/v1/dashboard/schedules")
async def save_schedule(request: ScheduleCreateUpdate):
    conn, cursor = get_db_connection()
    try:
        query_check = """
            SELECT id, last_run_time FROM schedules 
            WHERE database_name = %s AND schema_name = %s AND table_name = %s AND run_type = %s
        """ if DATABASE_URL else """
            SELECT id, last_run_time FROM schedules 
            WHERE database_name = ? AND schema_name = ? AND table_name = ? AND run_type = ?
        """
        cursor.execute(query_check, (request.database_name, request.schema_name, request.table_name, request.run_type))
        row = cursor.fetchone()
        
        custom_config_str = json.dumps(request.custom_config) if request.custom_config else None
        
        next_run_str = None
        if request.enabled and request.frequency not in ("Disabled", "Not Scheduled", ""):
            last_run = None
            if row and row["last_run_time"]:
                try:
                    last_run = datetime.datetime.fromisoformat(row["last_run_time"])
                except:
                    pass
            next_run = calculate_next_run_time(
                request.frequency, custom_config_str, request.start_time, request.timezone, last_run
            )
            if next_run:
                next_run_str = next_run.isoformat()
        
        if row:
            update_query = """
                UPDATE schedules
                SET platform = %s, frequency = %s, custom_config = %s, start_time = %s, timezone = %s, enabled = %s, next_run_time = %s, status = 'Active', last_error = NULL
                WHERE id = %s
            """ if DATABASE_URL else """
                UPDATE schedules
                SET platform = ?, frequency = ?, custom_config = ?, start_time = ?, timezone = ?, enabled = ?, next_run_time = ?, status = 'Active', last_error = NULL
                WHERE id = ?
            """
            cursor.execute(update_query, (
                request.platform, request.frequency, custom_config_str, request.start_time, request.timezone,
                1 if request.enabled else 0, next_run_str, row["id"]
            ))
        else:
            insert_query = """
                INSERT INTO schedules 
                    (platform, database_name, schema_name, table_name, run_type, frequency, custom_config, start_time, timezone, status, enabled, next_run_time)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'Active', %s, %s)
            """ if DATABASE_URL else """
                INSERT INTO schedules 
                    (platform, database_name, schema_name, table_name, run_type, frequency, custom_config, start_time, timezone, status, enabled, next_run_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)
            """
            cursor.execute(insert_query, (
                request.platform, request.database_name, request.schema_name, request.table_name, request.run_type,
                request.frequency, custom_config_str, request.start_time, request.timezone,
                1 if request.enabled else 0, next_run_str
            ))
            
        conn.commit()
        return {"status": "success", "message": "Schedule updated successfully"}
    except Exception as e:
        print(f"Error saving schedule: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.patch("/api/v1/dashboard/schedules/{schedule_id}")
async def patch_schedule(schedule_id: int, payload: Dict[str, Any] = Body(...)):
    conn, cursor = get_db_connection()
    try:
        query_select = "SELECT * FROM schedules WHERE id = %s" if DATABASE_URL else "SELECT * FROM schedules WHERE id = ?"
        cursor.execute(query_select, (schedule_id,))
        schedule = cursor.fetchone()
        if not schedule:
            raise HTTPException(status_code=404, detail="Schedule not found")
            
        fields_to_update = []
        params = []
        for key in ["enabled", "status"]:
            if key in payload:
                val = payload[key]
                if key == "enabled":
                    val = 1 if val else 0
                fields_to_update.append(f"{key} = %s" if DATABASE_URL else f"{key} = ?")
                params.append(val)
                
        if "enabled" in payload:
            enabled = payload["enabled"]
            if enabled and schedule["frequency"] not in ("Disabled", "Not Scheduled", ""):
                last_run = None
                if schedule["last_run_time"]:
                    try:
                        last_run = datetime.datetime.fromisoformat(schedule["last_run_time"])
                    except:
                        pass
                next_run = calculate_next_run_time(
                    schedule["frequency"], schedule["custom_config"], schedule["start_time"], schedule["timezone"], last_run
                )
                next_run_str = next_run.isoformat() if next_run else None
            else:
                next_run_str = None
                
            fields_to_update.append("next_run_time = %s" if DATABASE_URL else "next_run_time = ?")
            params.append(next_run_str)
            
            fields_to_update.append("last_error = NULL")
            fields_to_update.append("status = 'Active'")
            
        if not fields_to_update:
            return {"status": "success", "message": "No changes made"}
            
        query_update = f"UPDATE schedules SET {', '.join(fields_to_update)} WHERE id = " + ("%s" if DATABASE_URL else "?")
        params.append(schedule_id)
        
        cursor.execute(query_update, tuple(params))
        conn.commit()
        return {"status": "success", "message": "Schedule patched successfully"}
    except Exception as e:
        print(f"Error patching schedule: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/api/v1/dashboard/column_profiles")
async def get_column_profiles(platform: str, database_name: str, schema_name: str, table_name: str):
    conn, cursor = get_db_connection()
    try:
        query = """
            SELECT profile_data FROM column_profiles 
            WHERE platform = %s AND database_name = %s AND schema_name = %s AND table_name = %s
        """ if DATABASE_URL else """
            SELECT profile_data FROM column_profiles 
            WHERE platform = ? AND database_name = ? AND schema_name = ? AND table_name = ?
        """
        cursor.execute(query, (platform, database_name, schema_name, table_name))
        row = cursor.fetchone()
        if row:
            profile_data = json.loads(row["profile_data"])
            return {"status": "success", "profile": profile_data}
        return {"status": "success", "profile": None}
    except Exception as e:
        print(f"Error fetching cached column profiles: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/v1/dashboard/schedules/{schedule_id}/run")
async def trigger_schedule_now(schedule_id: int):
    t = threading.Thread(target=execute_schedule_job, args=(schedule_id,), daemon=True)
    t.start()
    return {"status": "success", "message": "Scheduled run triggered in background"}


# start_scheduler() # Deprecated in favor of Snowflake TASKS

@app.get("/api/v1/dq/runs")
async def get_dq_runs():
    try:
        snowflake_engine.connect(None)
        query = "SELECT * FROM DQ_RUN_HISTORY ORDER BY start_time DESC LIMIT 100"
        runs = snowflake_engine.execute_query(query)
        if not runs:
            runs = []
            
        # Format datetime objects
        for run in runs:
            # Snowflake connector returns standard python dates, but they might need stringifying
            # Lowercase keys to be safe or just pass as-is if fastapi json serializer handles it
            pass
            
        return {"status": "success", "runs": runs}
    except Exception as e:
        print(f"Error fetching DQ runs: {e}")
        return {"status": "error", "message": str(e), "runs": []}
    finally:
        try: snowflake_engine.disconnect()
        except: pass

@app.get("/api/v1/dq/runs/{run_id}")
async def get_dq_run_details(run_id: str):
    try:
        snowflake_engine.connect(None)
        run_query = f"SELECT * FROM DQ_RUN_HISTORY WHERE run_id = '{run_id}'"
        steps_query = f"SELECT * FROM DQ_STEP_LOGS WHERE run_id = '{run_id}' ORDER BY start_time ASC"
        
        run_result = snowflake_engine.execute_query(run_query)
        if not run_result:
            raise HTTPException(status_code=404, detail="Run not found")
            
        steps = snowflake_engine.execute_query(steps_query)
        if not steps:
            steps = []
            
        return {"status": "success", "run_details": run_result[0], "steps": steps}
    except Exception as e:
        print(f"Error fetching DQ run details: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try: snowflake_engine.disconnect()
        except: pass



@app.get("/api/v1/dashboard/catalog-quality-scores")
async def get_catalog_quality_scores():
    conn, cursor = get_db_connection()
    try:
        # Fetch the latest dq_score for each table
        query = """
            SELECT t1.table_name, t1.dq_score 
            FROM dq_run_history t1
            INNER JOIN (
                SELECT table_name, MAX(executed_at) as max_executed_at
                FROM dq_run_history
                GROUP BY table_name
            ) t2 ON t1.table_name = t2.table_name AND t1.executed_at = t2.max_executed_at
        """ if DATABASE_URL else """
            SELECT t1.table_name, t1.dq_score 
            FROM dq_run_history t1
            INNER JOIN (
                SELECT table_name, MAX(id) as max_id
                FROM dq_run_history
                GROUP BY table_name
            ) t2 ON t1.id = t2.max_id
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        
        scores_map = {row['table_name']: row['dq_score'] for row in rows}
        return {"status": "success", "scores": scores_map}
    except Exception as e:
        print(f"Error fetching catalog quality scores: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/v1/dashboard/executions/latest")
async def get_latest_table_executions(table_name: str):
    conn, cursor = get_db_connection()
    try:
        # 1. Fetch latest overall run for this table
        run_query = "SELECT * FROM dq_run_history WHERE table_name = %s ORDER BY id DESC LIMIT 1" if DATABASE_URL else "SELECT * FROM dq_run_history WHERE table_name = ? ORDER BY id DESC LIMIT 1"
        cursor.execute(run_query, (table_name,))
        latest_run = cursor.fetchone()
        
        if not latest_run:
            return {"status": "success", "has_evaluated": False, "overall": 100, "executions": []}
            
        # 2. Fetch the most recent execution for each column/rule combination
        exec_query = """
            SELECT t1.* 
            FROM rule_executions t1
            INNER JOIN (
                SELECT column_name, rule_type, MAX(id) as max_id
                FROM rule_executions
                WHERE table_name = %s
                GROUP BY column_name, rule_type
            ) t2 ON t1.id = t2.max_id
        """ if DATABASE_URL else """
            SELECT t1.* 
            FROM rule_executions t1
            INNER JOIN (
                SELECT column_name, rule_type, MAX(id) as max_id
                FROM rule_executions
                WHERE table_name = ?
                GROUP BY column_name, rule_type
            ) t2 ON t1.id = t2.max_id
        """
        cursor.execute(exec_query, (table_name,))
        executions = cursor.fetchall()
        
        return {
            "status": "success",
            "has_evaluated": True,
            "overall": latest_run['dq_score'],
            "executions": [dict(r) for r in executions]
        }
    except Exception as e:
        print(f"Error fetching latest executions: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/health")
def health_check():
    return {"status": "healthy"}
