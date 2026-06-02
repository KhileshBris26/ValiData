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
            except Exception:
                pass # Column likely already exists
        
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

@app.post("/api/v1/dq/suggest-rules")
async def suggest_rules_v2(request: SuggestRulesRequest):
    import uuid, datetime, json
    request_id = str(uuid.uuid4())
    generated_rules = []
    error_message = None
    status = "SUCCESS"
    generation_type = "RULE_BASED + AI"
    
    conn, cursor = get_db_connection()
    try:
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            
            # 1. Fetch Metadata
            col_list_str = ",".join([f"'{c}'" for c in request.selected_columns])
            meta_query = f"""
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
                FROM {request.database_name}.INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = '{request.schema_name}'
                AND TABLE_NAME = '{request.table_name}'
                AND COLUMN_NAME IN ({col_list_str})
            """
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
                else:
                    generated_rules.append({
                        "column_name": col_name,
                        "rule_type": "NULL_CHECK",
                        "rule_description": f"{col_name} should typically not be null",
                        "rule_params": None,
                        "confidence_score": "80%",
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
                    if 'EMAIL' in col_name.upper():
                        generated_rules.append({
                            "column_name": col_name,
                            "rule_type": "PATTERN_CHECK",
                            "rule_description": f"{col_name} should be a valid email format",
                            "rule_params": {"pattern": "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"},
                            "confidence_score": "95%",
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

                if 'NUMBER' in data_type or 'INT' in data_type or 'FLOAT' in data_type:
                    if 'AMOUNT' in col_name.upper() or 'PRICE' in col_name.upper() or 'QUANTITY' in col_name.upper():
                        generated_rules.append({
                            "column_name": col_name,
                            "rule_type": "RANGE_CHECK",
                            "rule_description": f"{col_name} should be >= 0",
                            "rule_params": {"min": 0},
                            "confidence_score": "90%",
                            "source": "RULE_BASED"
                        })

            # AI Semantic Inferences based on column naming heuristics
            for col in request.selected_columns:
                if 'STATUS' in col.upper() or 'STATE' in col.upper():
                     generated_rules.append({
                        "column_name": col,
                        "rule_type": "PATTERN_CHECK", 
                        "rule_description": f"AI Suggestion: {col} should have a restricted domain of values.",
                        "rule_params": None,
                        "confidence_score": "85%",
                        "source": "AI"
                     })
            
            snowflake_engine.disconnect()
        else:
            raise Exception("Platform not implemented for rule suggestions")
            
        log_query = "INSERT INTO dq_rule_generation_logs (request_id, table_name, columns_selected, rules_generated, generation_type, status, error_message, timestamp) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)" if DATABASE_URL else "INSERT INTO dq_rule_generation_logs (request_id, table_name, columns_selected, rules_generated, generation_type, status, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        cursor.execute(log_query, (request_id, request.table_name, json.dumps(request.selected_columns), len(generated_rules), generation_type, status, error_message, current_time))
        conn.commit()

        return {"status": "success", "rules": generated_rules}
    except Exception as e:
        log_query = "INSERT INTO dq_rule_generation_logs (request_id, table_name, columns_selected, rules_generated, generation_type, status, error_message, timestamp) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)" if DATABASE_URL else "INSERT INTO dq_rule_generation_logs (request_id, table_name, columns_selected, rules_generated, generation_type, status, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        cursor.execute(log_query, (request_id, request.table_name, json.dumps(request.selected_columns), 0, generation_type, "FAILED", str(e), current_time))
        conn.commit()
        raise HTTPException(status_code=500, detail=str(e))
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
        
        # Determine table path based on platform logic
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

