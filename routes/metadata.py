from typing import Optional
from fastapi import APIRouter, HTTPException
import json

from app.shared_resources.database.connection import get_db_connection, DATABASE_URL, get_platform_table
from app.shared_resources.database.connection import snowflake_engine, databricks_engine, snowflake_svc, databricks_svc

from app.shared_resources.core.query_generator import QueryGenerator
from models.rules import CatalogRequest, LineageRequest, TableSummaryRequest, MetadataRequest, ProfileRequest
from models.catalog_metadata import SaveMetadataRequest, FetchMetadataRequest, FetchAllMetadataRequest

router = APIRouter()

@router.post("/api/v1/metadata/save")
async def save_catalog_metadata(request: SaveMetadataRequest):
    try:
        if not request.credentials:
            raise HTTPException(status_code=400, detail="Missing credentials for warehouse pushdown")
            
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

@router.post("/api/v1/metadata/fetch")
async def fetch_catalog_metadata(request: FetchMetadataRequest):
    try:
        if not request.credentials:
            return {"status": "success", "description": "", "terms": [], "is_auto_generated": False}
            
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

@router.post("/api/v1/metadata/fetch-all")
async def fetch_all_catalog_metadata(request: FetchAllMetadataRequest):
    try:
        if not request.credentials or not request.database_name or not request.schema_name:
            return {"status": "success", "metadata": {}}
            
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

@router.post("/api/v1/metadata/entities")
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
                    row_lower = {k.lower(): v for k, v in row.items()}
                    if request.entity_type == 'columns':
                        col_name = row_lower.get('column_name') or row_lower.get('name')
                        col_type = row_lower.get('type') or row_lower.get('data_type')
                        is_null = row_lower.get('null?') or row_lower.get('nullable') or row_lower.get('is_nullable')
                        entities.append({"name": col_name, "type": col_type, "nullable": is_null == 'Y' or is_null == 'YES' or is_null is True})
                    else:
                        val = row_lower.get(key.lower()) or row_lower.get('name')
                        if val: entities.append(val)
            elif request.platform == "databricks":
                key_map = {"databases": "catalog", "schemas": "databaseName", "tables": "tableName", "columns": "col_name"}
                key = key_map.get(request.entity_type, "name")
                for row in result:
                    row_lower = {k.lower(): v for k, v in row.items()}
                    if request.entity_type == 'columns':
                        col_name = row_lower.get('col_name') or row_lower.get('column_name') or row_lower.get('name')
                        col_type = row_lower.get('data_type') or row_lower.get('type')
                        is_null = row_lower.get('nullable') or row_lower.get('null?') or row_lower.get('is_nullable')
                        is_nullable = True
                        if is_null is not None:
                            is_nullable = is_null is True or str(is_null).lower() in ('true', 'y', 'yes')
                        entities.append({"name": col_name, "type": col_type, "nullable": is_nullable})
                    else:
                        val = None
                        for cand in (key, key.lower(), key.upper(), 'name', 'tablename', 'table_name', 'databasename', 'database_name', 'catalog', 'catalog_name', 'schema', 'schema_name', 'namespace'):
                            if cand in row:
                                val = row[cand]
                                break
                            if cand.lower() in row_lower:
                                val = row_lower[cand.lower()]
                                break
                        if val: entities.append(val)
        return {"status": "success", "platform": request.platform, "entities": entities}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/v1/metadata/row_count")
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

@router.post("/api/v1/metadata/profile")
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
        
        if res and isinstance(res, list) and len(res) > 0:
            raw = res[0]
            normalized = {k.lower(): v for k, v in raw.items()} if raw else {}
            print(f"Profile result for {request.column_name}: {normalized}")
            return {"status": "success", "profile": normalized}
        return {"status": "success", "profile": {}}
    except Exception as e:
        print(f"Profiling failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/v1/catalog/tables")
async def get_catalog_tables(request: CatalogRequest):
    try:
        if request.platform == "snowflake":
            result = snowflake_svc.get_catalog_tables(request.credentials)
        elif request.platform == "databricks":
            result = databricks_svc.get_catalog_tables(request.credentials)
        else:
            result = []
        return {"status": "success", "tables": result or []}
    except Exception as e:
        print(f"Catalog connection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/v1/metadata/preview")
async def get_table_preview(request: LineageRequest):
    try:
        if request.platform == "snowflake":
            result = snowflake_svc.get_table_preview(request.credentials, request.database_name, request.schema_name, request.table_name)
        elif request.platform == "databricks":
            result = databricks_svc.get_table_preview(request.credentials, request.database_name, request.schema_name, request.table_name)
        else:
            result = []
        serialized_rows = [{str(k): str(v) for k, v in row.items()} for row in result] if result else []
        return {"status": "success", "rows": serialized_rows}
    except Exception as e:
        import traceback
        print(f"Preview failed: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/v1/dashboard/catalog-quality-scores")
async def get_catalog_quality_scores():
    conn, cursor = get_db_connection()
    try:
        scores_map = {}
        for plat in ['snowflake', 'databricks']:
            tbl = f"{plat}_dq_run_history"
            query = f"""
                SELECT t1.table_name, t1.dq_score 
                FROM {tbl} t1
                INNER JOIN (
                    SELECT table_name, MAX(executed_at) as max_executed_at
                    FROM {tbl}
                    GROUP BY table_name
                ) t2 ON t1.table_name = t2.table_name AND t1.executed_at = t2.max_executed_at
            """ if DATABASE_URL else f"""
                SELECT t1.table_name, t1.dq_score 
                FROM {tbl} t1
                INNER JOIN (
                    SELECT table_name, MAX(id) as max_id
                    FROM {tbl}
                    GROUP BY table_name
                ) t2 ON t1.id = t2.max_id
            """
            cursor.execute(query)
            rows = cursor.fetchall()
            for row in rows:
                scores_map[row['table_name']] = row['dq_score']
                
        return {"status": "success", "scores": scores_map}
    except Exception as e:
        print(f"Error fetching catalog quality scores: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


