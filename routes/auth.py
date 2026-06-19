import os
import hashlib
import json
from datetime import datetime, timedelta
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException
import requests as http_requests

from app.shared_resources.database.connection import get_db_connection, DATABASE_URL
from app.shared_resources.database.connection import snowflake_engine, databricks_engine
from models.rules import FetchRolesRequest, MetadataRequest

router = APIRouter()

# Request Models
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

class AdminRoleRequest(BaseModel):
    is_admin: bool
    admin_username: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str

@router.post("/api/v1/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    import secrets
    conn, cursor = get_db_connection()
    try:
        query = "SELECT username, full_name FROM users WHERE email = %s" if DATABASE_URL else "SELECT username, full_name FROM users WHERE email = ?"
        cursor.execute(query, (request.email,))
        user = cursor.fetchone()
        
        if not user:
            return {"status": "success", "message": "If that email is registered, an OTP has been sent."}
            
        otp = "".join([str(secrets.randbelow(10)) for _ in range(6)])
        expires_at = datetime.utcnow() + timedelta(minutes=10)
        
        update_query = "UPDATE users SET otp_code = %s, otp_expires_at = %s WHERE email = %s" if DATABASE_URL else "UPDATE users SET otp_code = ?, otp_expires_at = ? WHERE email = ?"
        cursor.execute(update_query, (otp, expires_at, request.email))
        conn.commit()
        
        resend_api_key = os.getenv("RESEND_API_KEY")
        from_email = os.getenv("RESEND_FROM_EMAIL", "ValiData <onboarding@resend.dev>")
        
        if resend_api_key:
            user_name = user['full_name'] or user['username']
            html_body = f'''
            <html>
              <body style="font-family: sans-serif; padding: 20px;">
                <h2>Password Reset Request</h2>
                <p>Hello {user_name},</p>
                <p>You requested to reset your password. Here is your One-Time Password (OTP):</p>
                <h1 style="color: #4f46e5; letter-spacing: 5px;">{otp}</h1>
                <p>This code will expire in 10 minutes.</p>
                <p>If you did not request this, please ignore this email.</p>
                <p>Thanks,<br>The ValiData Team</p>
              </body>
            </html>
            '''
            
            resp = http_requests.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "from": from_email,
                    "to": [request.email],
                    "subject": "ValiData - Password Reset OTP",
                    "html": html_body,
                }
            )
            
            if resp.status_code in (200, 201):
                print(f"Resend email sent successfully: {resp.json()}")
            else:
                print(f"Resend email failed (status {resp.status_code}): {resp.text}")
        else:
            print(f"MOCK EMAIL (No RESEND_API_KEY): OTP for {request.email} is {otp}")
            
        return {"status": "success", "message": "If that email is registered, an OTP has been sent."}
    except Exception as e:
        import traceback
        print(f"Forgot password error: {e}")
        print(f"Forgot password traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to process request")
    finally:
        conn.close()

@router.post("/api/v1/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    conn, cursor = get_db_connection()
    try:
        query = "SELECT otp_code, otp_expires_at FROM users WHERE email = %s" if DATABASE_URL else "SELECT otp_code, otp_expires_at FROM users WHERE email = ?"
        cursor.execute(query, (request.email,))
        user = cursor.fetchone()
        
        if not user or not user['otp_code']:
            raise HTTPException(status_code=400, detail="Invalid request or OTP expired.")
            
        expires_at = user['otp_expires_at']
        if isinstance(expires_at, str):
            try:
                expires_at = datetime.fromisoformat(expires_at.replace('Z', ''))
            except Exception:
                pass 
                
        if datetime.utcnow() > expires_at or user['otp_code'] != request.otp:
            raise HTTPException(status_code=400, detail="Invalid or expired OTP.")
            
        pw_hash = hashlib.sha256(request.new_password.encode()).hexdigest()
        update_query = "UPDATE users SET password_hash = %s, otp_code = NULL, otp_expires_at = NULL WHERE email = %s" if DATABASE_URL else "UPDATE users SET password_hash = ?, otp_code = NULL, otp_expires_at = NULL WHERE email = ?"
        cursor.execute(update_query, (pw_hash, request.email))
        conn.commit()
        
        return {"status": "success", "message": "Password reset successfully!"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Reset password error: {e}")
        raise HTTPException(status_code=500, detail="Failed to reset password")
    finally:
        conn.close()

@router.post("/api/v1/auth/register")
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

@router.post("/api/v1/auth/login")
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
        
        update_query = "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE username = %s" if DATABASE_URL else "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE username = ?"
        cursor.execute(update_query, (request.username,))
        conn.commit()
        
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

@router.post("/api/v1/auth/update_credentials")
async def update_credentials(request: UpdateCredentialsRequest):
    conn, cursor = get_db_connection()
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

@router.post("/api/v1/auth/update_role")
async def update_role(request: UpdateRoleRequest):
    conn, cursor = get_db_connection()
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

@router.get("/api/v1/admin/users")
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

@router.post("/api/v1/admin/users/{user_id}/status")
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

@router.delete("/api/v1/admin/users/{user_id}")
async def delete_user(user_id: str):
    conn, cursor = get_db_connection()
    try:
        if DATABASE_URL:
            query = "DELETE FROM users WHERE user_id = %s OR id::text = %s"
            cursor.execute(query, (user_id, user_id))
        else:
            try:
                query = "DELETE FROM users WHERE user_id = ? OR id = ?"
                cursor.execute(query, (user_id, user_id))
            except Exception:
                query = "DELETE FROM users WHERE id = ?"
                cursor.execute(query, (user_id,))
        conn.commit()
        return {"status": "success", "message": "User deleted successfully"}
    except Exception as e:
        print(f"Delete user error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete user")
    finally:
        conn.close()

@router.post("/api/v1/admin/users/{user_id}/admin_access")
async def toggle_admin_access(user_id: str, request: AdminRoleRequest):
    conn, cursor = get_db_connection()
    try:
        roles_json = '["PUBLIC", "ADMIN"]' if request.is_admin else '["PUBLIC"]'
        if DATABASE_URL:
            query = "UPDATE users SET roles = %s WHERE user_id = %s OR id::text = %s"
            cursor.execute(query, (roles_json, user_id, user_id))
        else:
            try:
                query = "UPDATE users SET roles = ? WHERE user_id = ? OR id = ?"
                cursor.execute(query, (roles_json, user_id, user_id))
            except Exception:
                query = "UPDATE users SET roles = ? WHERE id = ?"
                cursor.execute(query, (roles_json, user_id))
        conn.commit()
        return {"status": "success", "message": "Admin access updated"}
    except Exception as e:
        print(f"Admin access error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update admin access")
    finally:
        conn.close()

@router.post("/api/v1/auth/migrate_legacy_users")
async def migrate_legacy_users(request: MigrateUsersRequest):
    conn, cursor = get_db_connection()
    try:
        for u in request.users:
            username = u.get('username')
            if not username: continue
            
            sel_query = "SELECT id FROM users WHERE username = %s" if DATABASE_URL else "SELECT id FROM users WHERE username = ?"
            cursor.execute(sel_query, (username,))
            if cursor.fetchone(): continue
            
            user_id = u.get('id', f"usr_{hashlib.md5(username.encode()).hexdigest()[:8]}")
            full_name = u.get('full_name', '')
            email = u.get('email', '')
            password_raw = u.get('password_raw', 'ValiData@123')
            pw_hash = hashlib.sha256(password_raw.encode()).hexdigest()
            status = u.get('status', 'PENDING')
            platform = u.get('selected_platform', 'snowflake')
            
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

@router.post("/api/v1/auth/test-connection")
async def test_connection(request: MetadataRequest):
    try:
        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            snowflake_engine.execute_query("SELECT 1")
            snowflake_engine.disconnect()
        elif request.platform == "databricks":
            databricks_engine.connect(request.credentials)
            databricks_engine.execute_query("SELECT current_timestamp()")
            databricks_engine.disconnect()
        return {"status": "success", "message": "Connection successful!"}
    except Exception as e:
        import traceback
        error_detail = f"{str(e)}\n{traceback.format_exc()}"
        print(f"Connection test failed: {error_detail}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/v1/auth/fetch-roles")
async def fetch_roles(request: FetchRolesRequest):
    current_time = datetime.utcnow().isoformat()
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
                
                query_executed = "SELECT CURRENT_USER();"
                res_user = snowflake_engine.execute_query(query_executed)
                if not res_user:
                    raise Exception("Failed to retrieve CURRENT_USER() from Snowflake")
                current_sf_user = res_user[0].get('CURRENT_USER()') or res_user[0].get('current_user()') or res_user[0].get('CURRENT_USER') or res_user[0].get('current_user')
                if not current_sf_user:
                    raise Exception("Failed to extract current user from result")
                
                query_executed += f" SHOW GRANTS TO USER \"{current_sf_user}\"; SHOW USERS LIKE '{current_sf_user}';"
                
                res_grants = snowflake_engine.execute_query(f'SHOW GRANTS TO USER "{current_sf_user}"')
                for row in res_grants:
                    granted_on = row.get('granted_on') or row.get('GRANTED_ON')
                    if granted_on == 'ROLE':
                        role_val = row.get('role') or row.get('ROLE')
                        if role_val:
                            roles.append(role_val)
                            
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
        
        log_query = "INSERT INTO dq_role_fetch_logs (user_name, query_executed, roles_returned, status, error_message, timestamp) VALUES (%s, %s, %s, %s, %s, %s)" if DATABASE_URL else "INSERT INTO dq_role_fetch_logs (user_name, query_executed, roles_returned, status, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
        cursor.execute(log_query, (username, query_executed, json.dumps(roles), status, error_message, current_time))
        conn.commit()
        
        return {
            "status": "success", 
            "username": username,
            "default_role": default_role,
            "all_roles": roles,
            "roles": roles,
            "fetched_timestamp": current_time
        }
    except Exception as e:
        log_query = "INSERT INTO dq_role_fetch_logs (user_name, query_executed, roles_returned, status, error_message, timestamp) VALUES (%s, %s, %s, %s, %s, %s)" if DATABASE_URL else "INSERT INTO dq_role_fetch_logs (user_name, query_executed, roles_returned, status, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
        cursor.execute(log_query, (username, query_executed, "[]", "FAILED", str(e), current_time))
        conn.commit()
        
        print(f"Fetch roles endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/api/v1/auth/fetch-warehouses")
async def fetch_warehouses(request: FetchRolesRequest):
    current_time = datetime.utcnow().isoformat()
    warehouses = []
    username = (request.credentials or {}).get("user") or (request.credentials or {}).get("username") or "UNKNOWN"
    query_executed = ""
    error_message = None
    status = "FAILED"
    
    conn, cursor = get_db_connection()
    try:
        if request.platform == "snowflake":
            try:
                snowflake_engine.connect(request.credentials)
                query_executed = "SHOW WAREHOUSES;"
                res_wh = snowflake_engine.execute_query(query_executed)
                for row in res_wh:
                    wh_name = row.get('name') or row.get('NAME')
                    if wh_name:
                        warehouses.append(wh_name)
                snowflake_engine.disconnect()
                status = "SUCCESS"
            except Exception as conn_err:
                error_message = str(conn_err)
                raise conn_err
        elif request.platform == "databricks":
            http_path = (request.credentials or {}).get("http_path") or ""
            wh_name = f"Warehouse ({http_path.split('/')[-1]})" if http_path else "Default SQL Warehouse"
            warehouses = [wh_name]
            status = "SUCCESS"
            
        warehouses = sorted(list(set(warehouses)))
        
        log_query = "INSERT INTO dq_role_fetch_logs (user_name, query_executed, roles_returned, status, error_message, timestamp) VALUES (%s, %s, %s, %s, %s, %s)" if DATABASE_URL else "INSERT INTO dq_role_fetch_logs (user_name, query_executed, roles_returned, status, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
        cursor.execute(log_query, (username, query_executed, json.dumps(warehouses), status, error_message, current_time))
        conn.commit()
        
        return {
            "status": "success",
            "username": username,
            "warehouses": warehouses,
            "fetched_timestamp": current_time
        }
    except Exception as e:
        log_query = "INSERT INTO dq_role_fetch_logs (user_name, query_executed, roles_returned, status, error_message, timestamp) VALUES (%s, %s, %s, %s, %s, %s)" if DATABASE_URL else "INSERT INTO dq_role_fetch_logs (user_name, query_executed, roles_returned, status, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
        cursor.execute(log_query, (username, query_executed, "[]", "FAILED", str(e), current_time))
        conn.commit()
        
        print(f"Fetch warehouses endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

