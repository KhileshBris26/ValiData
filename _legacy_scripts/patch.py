import re

with open('main.py', 'r', encoding='utf-8') as f:
    content = f.read()

save_metadata = """
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
"""

fetch_metadata = """
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
"""

fetch_all_metadata = """
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
"""

start_idx = content.find('@app.post("/api/v1/metadata/save")')
if start_idx != -1:
    end_idx = content.find('@app.get("/api/v1/lineage/graph")')
    if end_idx == -1:
        end_idx = len(content)
        
    new_content = content[:start_idx] + save_metadata + "\n" + fetch_metadata + "\n" + fetch_all_metadata + "\n" + content[end_idx:]
    with open('main.py', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Replaced metadata endpoints successfully.")
else:
    print("Could not find start index")
