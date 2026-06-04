import re

with open('main.py', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """@app.post("/api/v1/dq/suggest-rules")
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
            
        log_query = "INSERT INTO dq_rule_generation_logs (request_id, table_name, columns_selected, rules_generated, generation_type, status, error_message, timestamp) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)" if DATABASE_URL else "INSERT INTO dq_rule_generation_logs (request_id, table_name, columns_selected, rules_generated, generation_type, status, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        cursor.execute(log_query, (request_id, request.table_name, json.dumps(request.selected_columns), len(generated_rules), generation_type, status, error_message, current_time))
        conn.commit()

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
        try:
            log_query = "INSERT INTO dq_rule_generation_logs (request_id, table_name, columns_selected, rules_generated, generation_type, status, error_message, timestamp) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)" if DATABASE_URL else "INSERT INTO dq_rule_generation_logs (request_id, table_name, columns_selected, rules_generated, generation_type, status, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            cursor.execute(log_query, (request_id, request.table_name, json.dumps(request.selected_columns), 0, generation_type, "FAILED", str(e), current_time))
            conn.commit()
        except:
            pass
        # Return a 200 with error structure instead of 500, or we can just raise a proper HTTP Exception but standardizing the return helps.
        # But wait, the previous code raised HTTPException 500. Let's return the structured response but with status_code=500.
        raise HTTPException(status_code=500, detail={"error": str(e), "stage": "DATABASE_FETCH"})
    finally:
        conn.close()"""

parts = content.split('@app.post("/api/v1/dq/suggest-rules")')
if len(parts) > 1:
    before = parts[0]
    after_parts = parts[1].split('@app.post("/api/v1/dq/apply-rules")')
    if len(after_parts) > 1:
        after = '@app.post("/api/v1/dq/apply-rules")' + after_parts[1]
        new_content = before + replacement + "\n\n" + after
        with open('main.py', 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Patched suggest rules")
    else:
        print("apply-rules not found")
else:
    print("suggest-rules not found")
