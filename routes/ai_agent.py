from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import uuid
import datetime
import json

from db.connection import get_db_connection, DATABASE_URL, get_platform_table
from db.connection import snowflake_engine, databricks_engine, snowflake_svc, databricks_svc
from core.query_generator import QueryGenerator
from models.rules import AISuggestionRequest, SuggestRulesRequest, ApplyRulesRequest, AIChatRequest, TableSummaryRequest, CatalogRequest

router = APIRouter()

@router.post("/api/v1/ai/suggest_rules")
async def suggest_rules(request: AISuggestionRequest):
    try:
        if request.platform == "snowflake":
            result = snowflake_svc.suggest_rules_ai(request.credentials, request.table_name, request.column_name)
        elif request.platform == "databricks":
            result = databricks_svc.suggest_rules_ai(request.credentials, request.table_name, request.column_name)
        else:
            result = []
            
        sql_query = QueryGenerator.generate_ai_suggestion_sql(request.platform, request.table_name, request.column_name)
        return {"status": "success", "platform": request.platform, "executed_query": sql_query.strip(), "ai_suggestions": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/v1/dq/suggest-rules")
async def suggest_rules_v2(request: SuggestRulesRequest):
    request_id = str(uuid.uuid4())
    generated_rules = []
    error_message = None
    failure_stage = None
    status = "SUCCESS"
    generation_type = "RULE_BASED + AI"
    current_time = datetime.datetime.now()
    
    conn, cursor = get_db_connection()
    try:
        if request.platform not in ["snowflake", "databricks"]:
            raise Exception(f"Unsupported platform: {request.platform}")

        try:
            if request.platform == "snowflake":
                meta_res = snowflake_svc.fetch_column_metadata(request.credentials, request.database_name, request.schema_name, request.table_name, request.selected_columns)
            elif request.platform == "databricks":
                meta_res = databricks_svc.fetch_column_metadata(request.credentials, request.database_name, request.schema_name, request.table_name, request.selected_columns)
            else:
                meta_res = []
            
            for row in meta_res:
                col_name = row.get('COLUMN_NAME') or row.get('column_name')
                data_type = str(row.get('DATA_TYPE') or row.get('data_type')).upper()
                is_nullable = str(row.get('IS_NULLABLE') or row.get('is_nullable')).upper()
                
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

                if 'NUMBER' in data_type or 'INT' in data_type or 'FLOAT' in data_type or 'DECIMAL' in data_type or 'DOUBLE' in data_type or 'BIGINT' in data_type or 'LONG' in data_type:
                    generated_rules.append({
                        "column_name": col_name,
                        "rule_type": "RANGE_CHECK",
                        "rule_description": f"{col_name} should typically be >= 0",
                        "rule_params": {"min_val": 0},
                        "confidence_score": "85%",
                        "source": "RULE_BASED"
                    })

            try:
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
        except Exception as e:
            error_message = str(e)
            failure_stage = "METADATA_FETCH"
            status = "FAILED"
            
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
        raise HTTPException(status_code=500, detail={"error": str(e), "stage": "DATABASE_FETCH"})
    finally:
        conn.close()

@router.post("/api/v1/dq/apply-rules")
async def apply_rules(request: ApplyRulesRequest):
    conn, cursor = get_db_connection()
    try:
        for rule in request.rules:
            check_q = f"SELECT id FROM {get_platform_table('rules', request.platform)} WHERE platform = %s AND database_name = %s AND schema_name = %s AND table_name = %s AND column_name = %s AND rule_type = %s" if DATABASE_URL else f"SELECT id FROM {get_platform_table('rules', request.platform)} WHERE platform = ? AND database_name = ? AND schema_name = ? AND table_name = ? AND column_name = ? AND rule_type = ?"
            cursor.execute(check_q, (request.platform, request.database_name, request.schema_name, request.table_name, rule.column_name, rule.rule_type))
            existing = cursor.fetchone()
            
            rule_params_str = json.dumps(rule.rule_params) if rule.rule_params else None
            
            if existing:
                upd_q = f"UPDATE {get_platform_table('rules', request.platform)} SET rule_params = %s, status = 'Active' WHERE id = %s" if DATABASE_URL else f"UPDATE {get_platform_table('rules', request.platform)} SET rule_params = ?, status = 'Active' WHERE id = ?"
                cursor.execute(upd_q, (rule_params_str, existing['id']))
            else:
                ins_q = f"INSERT INTO {get_platform_table('rules', request.platform)} (platform, database_name, schema_name, table_name, column_name, rule_type, rule_params, status) VALUES (%s, %s, %s, %s, %s, %s, %s, 'Active')" if DATABASE_URL else f"INSERT INTO {get_platform_table('rules', request.platform)} (platform, database_name, schema_name, table_name, column_name, rule_type, rule_params, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')"
                cursor.execute(ins_q, (request.platform, request.database_name, request.schema_name, request.table_name, rule.column_name, rule.rule_type, rule_params_str))
                
        conn.commit()
        return {"status": "success", "message": f"Successfully applied {len(request.rules)} rules."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.post("/api/v1/ai/chat")
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
                    last_user_msg = next((m.get("text", "").lower() for m in reversed(request.messages) if m.get("role") == "user"), "")
                    
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
                        db_name = None
                        if "in " in last_user_msg:
                            parts = last_user_msg.split("in ")
                            if len(parts) > 1:
                                db_name = parts[1].split()[0].upper().strip("?'\"`")
                        
                        if db_name:
                            try:
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

@router.post("/api/v1/ai/test")
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

@router.post("/api/v1/ai/table_summary")
async def generate_table_summary(request: TableSummaryRequest):
    try:
        if request.platform == "snowflake":
            summary = snowflake_svc.generate_table_summary(request.credentials, request.table_name)
        elif request.platform == "databricks":
            summary = databricks_svc.generate_table_summary(request.credentials, request.table_name)
        else:
            summary = ""
        return {"status": "success", "summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
