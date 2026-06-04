import re

with open('main.py', 'r', encoding='utf-8') as f:
    content = f.read()

new_endpoints = """
@app.get("/api/v1/dashboard/catalog-quality-scores")
async def get_catalog_quality_scores():
    conn, cursor = get_db_connection()
    try:
        # Fetch the latest dq_score for each table
        query = \"\"\"
            SELECT t1.table_name, t1.dq_score 
            FROM dq_run_history t1
            INNER JOIN (
                SELECT table_name, MAX(executed_at) as max_executed_at
                FROM dq_run_history
                GROUP BY table_name
            ) t2 ON t1.table_name = t2.table_name AND t1.executed_at = t2.max_executed_at
        \"\"\" if DATABASE_URL else \"\"\"
            SELECT t1.table_name, t1.dq_score 
            FROM dq_run_history t1
            INNER JOIN (
                SELECT table_name, MAX(id) as max_id
                FROM dq_run_history
                GROUP BY table_name
            ) t2 ON t1.id = t2.max_id
        \"\"\"
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
        exec_query = \"\"\"
            SELECT t1.* 
            FROM rule_executions t1
            INNER JOIN (
                SELECT column_name, rule_type, MAX(id) as max_id
                FROM rule_executions
                WHERE table_name = %s
                GROUP BY column_name, rule_type
            ) t2 ON t1.id = t2.max_id
        \"\"\" if DATABASE_URL else \"\"\"
            SELECT t1.* 
            FROM rule_executions t1
            INNER JOIN (
                SELECT column_name, rule_type, MAX(id) as max_id
                FROM rule_executions
                WHERE table_name = ?
                GROUP BY column_name, rule_type
            ) t2 ON t1.id = t2.max_id
        \"\"\"
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

"""

# Insert before @app.get("/health")
if "@app.get(\"/health\")" in content:
    content = content.replace("@app.get(\"/health\")", new_endpoints + "\n@app.get(\"/health\")")
    with open('main.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched main.py successfully")
else:
    print("Could not find insertion point")
