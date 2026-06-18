from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
import datetime
import json
import traceback
import threading

from db.connection import get_db_connection, DATABASE_URL, get_platform_table, get_saved_credentials
from db.connection import snowflake_engine, databricks_engine, snowflake_svc, databricks_svc
from core.query_generator import QueryGenerator
from models.rules import RuleExecutionRequest, ExecutionLogRequest, AnomalyResolveRequest, ScheduleCreateUpdate, RuleSyncRequest, DashboardRequest

router = APIRouter()

# Scheduling Helper Functions
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
        saved_creds = get_saved_credentials(platform)
        engine.connect(saved_creds)
        
        if run_type == "profile":
            sql_query = QueryGenerator.generate_metadata_sql(platform, 'columns', db_name, sch_name, tbl_name)
            result = engine.execute_query(sql_query)
            
            columns = []
            if result:
                if platform == "snowflake":
                    for row in result:
                        row_lower = {k.lower(): v for k, v in row.items()}
                        val = row_lower.get('column_name') or row_lower.get('name')
                        if val: columns.append(val)
                elif platform == "databricks":
                    for row in result:
                        row_lower = {k.lower(): v for k, v in row.items()}
                        val = row_lower.get('col_name') or row_lower.get('column_name') or row_lower.get('name')
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
                tbl_profiles = get_platform_table('column_profiles', platform)
                if DATABASE_URL:
                    upsert_query = f"""
                        INSERT INTO {tbl_profiles} (platform, database_name, schema_name, table_name, profile_data, updated_at)
                        VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                        ON CONFLICT (platform, database_name, schema_name, table_name)
                        DO UPDATE SET profile_data = EXCLUDED.profile_data, updated_at = CURRENT_TIMESTAMP
                    """
                else:
                    upsert_query = f"""
                        INSERT OR REPLACE INTO {tbl_profiles} (platform, database_name, schema_name, table_name, profile_data, updated_at)
                        VALUES (?, ?, ?, ?, ?, datetime('now'))
                    """
                cursor_db.execute(upsert_query, (platform, db_name, sch_name, tbl_name, profiles_json))
                
                run_end = datetime.datetime.utcnow()
                duration_ms = int((run_end - run_start).total_seconds() * 1000)
                run_date = run_end.strftime('%Y-%m-%d')
                run_time = run_end.strftime('%H:%M:%S UTC')
                
                tbl_history = get_platform_table('dq_run_history', platform)
                history_query = f"""
                    INSERT INTO {tbl_history}
                        (platform, table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """ if DATABASE_URL else f"""
                    INSERT INTO {tbl_history}
                        (platform, table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
                cursor_db.execute(history_query, (
                    platform, tbl_name, run_date, run_time, 100.0,
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
                tbl_rules = get_platform_table('rules', platform)
                query_rules = f"""
                    SELECT * FROM {tbl_rules} 
                    WHERE database_name = %s AND schema_name = %s AND table_name = %s AND status = 'Active'
                """ if DATABASE_URL else f"""
                    SELECT * FROM {tbl_rules} 
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
                                
                            tbl_anomalies = get_platform_table('anomalies', platform)
                            check_anomaly = f"""
                                SELECT id FROM {tbl_anomalies} WHERE title = %s AND msg = %s AND status = 'Active'
                            """ if DATABASE_URL else f"""
                                SELECT id FROM {tbl_anomalies} WHERE title = ? AND msg = ? AND status = 'Active'
                            """
                            cursor_db.execute(check_anomaly, (title_text, msg_text))
                            if not cursor_db.fetchone():
                                cursor_db.execute(
                                    f"INSERT INTO {tbl_anomalies} (title, msg, type, platform, status) VALUES (%s, %s, %s, %s, %s)" if DATABASE_URL else f"INSERT INTO {tbl_anomalies} (title, msg, type, platform, status) VALUES (?, ?, ?, ?, ?)",
                                    (title_text, msg_text, "null" if "null" in title_text.lower() else "uniqueness", platform, "Active")
                                )
                    
                    tbl_executions = get_platform_table('rule_executions', platform)
                    execs_query = f"""
                        INSERT INTO {tbl_executions} (platform, table_name, column_name, rule_type, total_rows, failed_rows, status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """ if DATABASE_URL else f"""
                        INSERT INTO {tbl_executions} (platform, table_name, column_name, rule_type, total_rows, failed_rows, status)
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
                    
                    tbl_history = get_platform_table('dq_run_history', platform)
                    history_query = f"""
                        INSERT INTO {tbl_history}
                            (platform, table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """ if DATABASE_URL else f"""
                        INSERT INTO {tbl_history}
                            (platform, table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """
                    cursor_db.execute(history_query, (
                        platform, tbl_name, run_date, run_time, dq_score,
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
            
            tbl_history = get_platform_table('dq_run_history', platform)
            history_query = f"""
                INSERT INTO {tbl_history}
                    (platform, table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """ if DATABASE_URL else f"""
                INSERT INTO {tbl_history}
                    (platform, table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            cursor_db.execute(history_query, (
                platform, tbl_name, run_date, run_time, 0.0,
                0, 0, 0,
                'Failed', 'Scheduled', duration_ms
            ))
            
            tbl_anomalies = get_platform_table('anomalies', platform)
            anom_title = "Scheduled Run Failure"
            anom_msg = f"Scheduled run failed for {tbl_name} ({run_type}): {str(e)}"
            cursor_db.execute(
                f"INSERT INTO {tbl_anomalies} (title, msg, type, platform, status) VALUES (%s, %s, %s, %s, %s)" if DATABASE_URL else f"INSERT INTO {tbl_anomalies} (title, msg, type, platform, status) VALUES (?, ?, ?, ?, ?)",
                (anom_title, anom_msg, "system", platform, "Active")
            )
            conn_db.commit()
        finally:
            conn_db.close()

# Request model helper
class FailedCheckItem(BaseModel):
    column_name: str
    rule_type: str

class SampleFailedRecordsRequest(BaseModel):
    platform: str
    table_name: str
    failed_checks: list[FailedCheckItem]
    credentials: Optional[Dict[str, Any]] = None

@router.post("/api/v1/rules/execute")
async def execute_rule(request: RuleExecutionRequest):
    try:
        sql_query = QueryGenerator.generate_dq_rule_sql(
            platform=request.platform,
            table=request.table_name,
            column=request.column_name,
            rule_type=request.rule_type,
            rule_params=request.rule_params
        )
        if request.platform == "snowflake":
            result = snowflake_svc.execute_dq_rule(request.credentials, sql_query)
        elif request.platform == "databricks":
            result = databricks_svc.execute_dq_rule(request.credentials, sql_query)
        else:
            result = []

        if result and isinstance(result, list) and len(result) > 0:
            first_row = result[0]
            total_rows = first_row.get('TOTAL_ROWS') or first_row.get('total_rows') or 0
            failed_rows = first_row.get('FAILED_ROWS') or first_row.get('failed_rows') or 0
            status = 'pass' if failed_rows == 0 else 'fail'
            
            conn_log, cursor_log = get_db_connection()
            try:
                parts = request.table_name.split('.')
                db_name = parts[0] if len(parts) > 0 else 'UNKNOWN'
                sch_name = parts[1] if len(parts) > 1 else 'UNKNOWN'
                tbl_name = parts[2] if len(parts) > 2 else request.table_name
                
                check_rule_query = f"""
                    SELECT id FROM {get_platform_table('rules', request.platform)} 
                    WHERE platform = %s AND database_name = %s AND schema_name = %s AND table_name = %s AND column_name = %s AND rule_type = %s
                """ if DATABASE_URL else f"""
                    SELECT id FROM {get_platform_table('rules', request.platform)} 
                    WHERE platform = ? AND database_name = ? AND schema_name = ? AND table_name = ? AND column_name = ? AND rule_type = ?
                """
                cursor_log.execute(check_rule_query, (
                    request.platform, db_name, sch_name, tbl_name, request.column_name, request.rule_type
                ))
                if not cursor_log.fetchone():
                    insert_rule_query = f"""
                        INSERT INTO {get_platform_table('rules', request.platform)} (platform, database_name, schema_name, table_name, column_name, rule_type, rule_params, status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """ if DATABASE_URL else f"""
                        INSERT INTO {get_platform_table('rules', request.platform)} (platform, database_name, schema_name, table_name, column_name, rule_type, rule_params, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """
                    cursor_log.execute(insert_rule_query, (
                        request.platform, db_name, sch_name, tbl_name, request.column_name, request.rule_type, json.dumps(request.rule_params or {}), 'Active'
                    ))
                
                exec_log_query = f"""
                    INSERT INTO {get_platform_table('rule_executions', request.platform)} (platform, table_name, column_name, rule_type, total_rows, failed_rows, status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """ if DATABASE_URL else f"""
                    INSERT INTO {get_platform_table('rule_executions', request.platform)} (platform, table_name, column_name, rule_type, total_rows, failed_rows, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """
                cursor_log.execute(exec_log_query, (
                    request.platform, request.table_name, request.column_name, request.rule_type, total_rows, failed_rows, status
                ))
                
                if failed_rows > 0:
                    msg_text = f"{request.table_name}: {request.column_name} column failed {request.rule_type}. {failed_rows} failed rows."
                    title_text = f"{request.rule_type} Failure"
                    if request.rule_type == 'NULL_CHECK':
                        title_text = "Null Rate Violation"
                        msg_text = f"{request.table_name}: {request.column_name} column showed a sudden jump in nulls ({failed_rows} records)."
                    elif request.rule_type == 'UNIQUE_CHECK':
                        title_text = "Uniqueness Violation"
                        msg_text = f"{request.table_name}: {request.column_name} column has duplicates."
                        
                    check_anom = f"""
                        SELECT id FROM {get_platform_table('anomalies', request.platform)} WHERE title = %s AND msg = %s AND status = 'Active'
                    """ if DATABASE_URL else f"""
                        SELECT id FROM {get_platform_table('anomalies', request.platform)} WHERE title = ? AND msg = ? AND status = 'Active'
                    """
                    cursor_log.execute(check_anom, (title_text, msg_text))
                    if not cursor_log.fetchone():
                        cursor_log.execute(
                            f"INSERT INTO {get_platform_table('anomalies', request.platform)} (title, msg, type, status) VALUES (%s, %s, %s, %s)" if DATABASE_URL else f"INSERT INTO {get_platform_table('anomalies', request.platform)} (title, msg, type, status) VALUES (?, ?, ?, ?)",
                            (title_text, msg_text, "null" if "null" in title_text.lower() else "uniqueness", "Active")
                        )
                conn_log.commit()
            except Exception as e_log:
                print(f"Failed to log execution details: {e_log}")
            finally:
                conn_log.close()

        return {"status": "success", "execution": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/v1/dq/runs")
async def get_dq_runs():
    try:
        snowflake_engine.connect(get_saved_credentials("snowflake"))
        query = "SELECT * FROM DQ_RUN_HISTORY ORDER BY start_time DESC LIMIT 100"
        runs = snowflake_engine.execute_query(query)
        if not runs:
            runs = []
        return {"status": "success", "runs": runs}
    except Exception as e:
        print(f"Error fetching DQ runs: {e}")
        return {"status": "error", "message": str(e), "runs": []}
    finally:
        try: snowflake_engine.disconnect()
        except: pass

@router.get("/api/v1/dq/runs/{run_id}")
async def get_dq_run_details(run_id: str):
    try:
        snowflake_engine.connect(get_saved_credentials("snowflake"))
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

@router.get("/api/v1/dashboard/metrics")
async def get_dashboard_metrics(platform: Optional[str] = None):
    conn, cursor = get_db_connection()
    try:
        tbl_rules = get_platform_table('rules', platform)
        tbl_executions = get_platform_table('rule_executions', platform)
        tbl_anomalies = get_platform_table('anomalies', platform)

        query = f"SELECT COUNT(*) as count FROM {tbl_rules} WHERE status = 'Active'"
        cursor.execute(query)
        row = cursor.fetchone()
        active_rules_count = row['count'] if row else 0

        query = f"""
            SELECT COUNT(*) as count FROM {tbl_executions} 
            WHERE id IN (
                SELECT MAX(id) FROM {tbl_executions} 
                GROUP BY platform, table_name, column_name, rule_type
            ) AND status = 'pass'
        """
        cursor.execute(query)
        row = cursor.fetchone()
        passed_checks_count = row['count'] if row else 0

        query = f"SELECT COUNT(*) as count FROM {tbl_anomalies} WHERE status = 'Active'"
        cursor.execute(query)
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

@router.get("/api/v1/dashboard/rules")
async def get_dashboard_rules(platform: Optional[str] = None):
    conn, cursor = get_db_connection()
    try:
        tbl_rules = get_platform_table('rules', platform)
        query = f"SELECT * FROM {tbl_rules} ORDER BY created_at DESC"
        cursor.execute(query)
        rows = cursor.fetchall()
        rules = [dict(row) for row in rows]
        return {"status": "success", "rules": rules}
    except Exception as e:
        print(f"Error fetching dashboard rules: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/api/v1/dashboard/anomalies")
async def get_dashboard_anomalies(platform: Optional[str] = None):
    conn, cursor = get_db_connection()
    try:
        tbl_anomalies = get_platform_table('anomalies', platform)
        query = f"SELECT * FROM {tbl_anomalies} WHERE status = 'Active' ORDER BY detected_at DESC"
        cursor.execute(query)
        rows = cursor.fetchall()
        anomalies = [dict(row) for row in rows]
        return {"status": "success", "anomalies": anomalies}
    except Exception as e:
        print(f"Error fetching dashboard anomalies: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/api/v1/dashboard/rules/sync")
async def sync_dashboard_rules(request: RuleSyncRequest):
    conn, cursor = get_db_connection()
    try:
        tables_to_clear = set()
        for r in request.rules:
            plat = r.platform or request.platform or 'snowflake'
            tables_to_clear.add((plat, r.database_name, r.schema_name, r.table_name))
            
        for platform_name, db_name, sch_name, tbl_name in tables_to_clear:
            tbl_rules = get_platform_table('rules', platform_name)
            cursor.execute(
                f"DELETE FROM {tbl_rules} WHERE database_name = %s AND schema_name = %s AND table_name = %s" if DATABASE_URL else
                f"DELETE FROM {tbl_rules} WHERE database_name = ? AND schema_name = ? AND table_name = ?",
                (db_name, sch_name, tbl_name)
            )
        
        for r in request.rules:
            plat = r.platform or request.platform or 'snowflake'
            tbl_rules = get_platform_table('rules', plat)
            params_str = json.dumps(r.rule_params) if r.rule_params else "{}"
            insert_query = f"""
                INSERT INTO {tbl_rules} (platform, database_name, schema_name, table_name, column_name, rule_type, rule_params, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """ if DATABASE_URL else f"""
                INSERT INTO {tbl_rules} (platform, database_name, schema_name, table_name, column_name, rule_type, rule_params, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """
            cursor.execute(insert_query, (
                plat, r.database_name, r.schema_name, r.table_name, r.column_name, r.rule_type, params_str, r.status
            ))
        conn.commit()
        
        plat_to_fetch = request.platform or 'snowflake'
        cursor.execute(f"SELECT * FROM {get_platform_table('rules', plat_to_fetch)} ORDER BY created_at DESC")
        rows = cursor.fetchall()
        rules = [dict(row) for row in rows]
        return {"status": "success", "rules": rules}
    except Exception as e:
        print(f"Error syncing rules: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/api/v1/dashboard/invalid_records")
async def get_invalid_records(table_name: str, platform: Optional[str] = None):
    conn, cursor = get_db_connection()
    try:
        ph = "%s" if DATABASE_URL else "?"
        tbl_executions = get_platform_table('rule_executions', platform)
        cursor.execute(
            f"SELECT column_name, rule_type, failed_rows, status FROM {tbl_executions} WHERE table_name = {ph} AND failed_rows > 0",
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

@router.post("/api/v1/dashboard/sample_failed_records")
async def sample_failed_records(request: SampleFailedRecordsRequest):
    creds = request.credentials or {}
    if request.platform == "snowflake":
        groups = snowflake_svc.sample_failed_records(creds, request.table_name, request.failed_checks)
    elif request.platform == "databricks":
        groups = databricks_svc.sample_failed_records(creds, request.table_name, request.failed_checks)
    else:
        return {"status": "success", "groups": []}
    return {"status": "success", "groups": groups}

@router.post("/api/v1/dashboard/executions")
async def log_dashboard_executions(request: ExecutionLogRequest):
    run_start = datetime.datetime.utcnow()
    conn, cursor = get_db_connection()
    try:
        tbl_executions = get_platform_table('rule_executions', request.platform)
        tbl_anomalies = get_platform_table('anomalies', request.platform)
        tbl_history = get_platform_table('dq_run_history', request.platform)

        executions_data = []
        for ex in request.executions:
            executions_data.append((
                request.platform, request.table_name, ex.column_name, ex.rule_type, ex.total_rows, ex.failed_rows, ex.status
            ))
            
            if ex.failed_rows > 0 or ex.status == 'fail':
                msg_text = f"{request.table_name}: {ex.column_name} column failed {ex.rule_type}. {ex.failed_rows} failed rows."
                title_text = f"{ex.rule_type} Failure"
                if ex.rule_type == 'Null Check' or ex.rule_type == 'NULL_CHECK':
                    title_text = "Null Rate Violation"
                    msg_text = f"{request.table_name}: {ex.column_name} column showed a sudden jump in nulls ({ex.failed_rows} records)."
                elif ex.rule_type == 'Unique Check' or ex.rule_type == 'UNIQUE_CHECK':
                    title_text = "Uniqueness Violation"
                    msg_text = f"{request.table_name}: {ex.column_name} column has duplicates."
                
                check_anomaly_query = f"""
                    SELECT id FROM {tbl_anomalies} 
                    WHERE title = %s AND msg = %s AND status = 'Active'
                """ if DATABASE_URL else f"""
                    SELECT id FROM {tbl_anomalies} 
                    WHERE title = ? AND msg = ? AND status = 'Active'
                """
                cursor.execute(check_anomaly_query, (title_text, msg_text))
                if not cursor.fetchone():
                    cursor.execute(
                        f"INSERT INTO {tbl_anomalies} (title, msg, type, platform, status) VALUES (%s, %s, %s, %s, %s)" if DATABASE_URL else f"INSERT INTO {tbl_anomalies} (title, msg, type, platform, status) VALUES (?, ?, ?, ?, ?)",
                        (title_text, msg_text, "null" if "null" in title_text.lower() else "uniqueness", request.platform, "Active")
                    )

        execs_query = f"""
            INSERT INTO {tbl_executions} (platform, table_name, column_name, rule_type, total_rows, failed_rows, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """ if DATABASE_URL else f"""
            INSERT INTO {tbl_executions} (platform, table_name, column_name, rule_type, total_rows, failed_rows, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        cursor.executemany(execs_query, executions_data)

        if request.executions:
            total_rows_agg   = max((ex.total_rows for ex in request.executions), default=0)
            failed_rows_agg  = sum(ex.failed_rows for ex in request.executions)
            passed_rows_agg  = total_rows_agg - failed_rows_agg
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

            history_query = f"""
                INSERT INTO {tbl_history}
                    (platform, table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """ if DATABASE_URL else f"""
                INSERT INTO {tbl_history}
                    (platform, table_name, run_date, run_time, dq_score, total_rows, passed_rows, failed_rows, status, executed_by, duration_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            cursor.execute(history_query, (
                request.platform, request.table_name, run_date, run_time, dq_score,
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

@router.post("/api/v1/dashboard/anomalies/resolve")
async def resolve_dashboard_anomaly(request: AnomalyResolveRequest):
    conn, cursor = get_db_connection()
    try:
        for plat in ["snowflake", "databricks"]:
            tbl_anom = f"{plat}_anomalies"
            query = f"UPDATE {tbl_anom} SET status = %s WHERE id = %s" if DATABASE_URL else f"UPDATE {tbl_anom} SET status = ? WHERE id = ?"
            cursor.execute(query, ("Resolved", request.id))
        conn.commit()
        return {"status": "success", "message": f"Anomaly {request.id} resolved successfully."}
    except Exception as e:
        print(f"Error resolving anomaly: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/api/v1/dashboard/run_history")
async def get_run_history(table_name: str, platform: Optional[str] = None):
    conn, cursor = get_db_connection()
    try:
        plat = platform
        if not plat:
            ph = "%s" if DATABASE_URL else "?"
            cursor.execute(f"SELECT 1 FROM snowflake_dq_run_history WHERE table_name = {ph} LIMIT 1", (table_name,))
            if cursor.fetchone():
                plat = 'snowflake'
            else:
                cursor.execute(f"SELECT 1 FROM databricks_dq_run_history WHERE table_name = {ph} LIMIT 1", (table_name,))
                if cursor.fetchone():
                    plat = 'databricks'
                else:
                    plat = 'snowflake'
                    
        tbl_history = get_platform_table('dq_run_history', plat)
        ph = "%s" if DATABASE_URL else "?"
        cursor.execute(
            f"""
            SELECT id, table_name, run_date, run_time, dq_score,
                   total_rows, passed_rows, failed_rows, status,
                   executed_by, duration_ms, executed_at
            FROM {tbl_history}
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

@router.get("/api/v1/dashboard/schedules")
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

@router.post("/api/v1/dashboard/schedules")
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

@router.patch("/api/v1/dashboard/schedules/{schedule_id}")
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

@router.post("/api/v1/dashboard/schedules/{schedule_id}/run")
async def trigger_schedule_now(schedule_id: int):
    t = threading.Thread(target=execute_schedule_job, args=(schedule_id,), daemon=True)
    t.start()
    return {"status": "success", "message": "Scheduled run triggered in background"}

@router.get("/api/v1/dashboard/executions/latest")
async def get_latest_table_executions(table_name: str, platform: Optional[str] = None):
    conn, cursor = get_db_connection()
    try:
        plat = platform
        if not plat:
            ph = "%s" if DATABASE_URL else "?"
            cursor.execute(f"SELECT 1 FROM snowflake_dq_run_history WHERE table_name = {ph} LIMIT 1", (table_name,))
            if cursor.fetchone():
                plat = 'snowflake'
            else:
                cursor.execute(f"SELECT 1 FROM databricks_dq_run_history WHERE table_name = {ph} LIMIT 1", (table_name,))
                if cursor.fetchone():
                    plat = 'databricks'
                else:
                    plat = 'snowflake'
                    
        tbl_history = get_platform_table('dq_run_history', plat)
        tbl_executions = get_platform_table('rule_executions', plat)
        
        ph = "%s" if DATABASE_URL else "?"
        run_query = f"SELECT * FROM {tbl_history} WHERE table_name = {ph} ORDER BY id DESC LIMIT 1"
        cursor.execute(run_query, (table_name,))
        latest_run = cursor.fetchone()
        
        if not latest_run:
            return {"status": "success", "has_evaluated": False, "overall": 100, "executions": []}
            
        exec_query = f"""
            SELECT t1.* 
            FROM {tbl_executions} t1
            INNER JOIN (
                SELECT column_name, rule_type, MAX(id) as max_id
                FROM {tbl_executions}
                WHERE table_name = {ph}
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
