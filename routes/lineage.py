from fastapi import APIRouter, HTTPException
from typing import Optional

from app.shared_resources.database.connection import snowflake_engine, databricks_engine, snowflake_svc, databricks_svc
from app.shared_resources.core.query_generator import QueryGenerator
from app.shared_resources.core.lineage_engine import LineageEngine
from models.rules import LineageRequest, DashboardRequest

router = APIRouter()

@router.post("/api/v1/lineage/infer")
async def infer_lineage(request: LineageRequest):
    try:
        if request.platform == "snowflake":
            lineage_graph = snowflake_svc.infer_lineage(request.credentials, request.database_name, request.schema_name)
        elif request.platform == "databricks":
            lineage_graph = databricks_svc.infer_lineage(request.credentials, request.database_name, request.schema_name)
        else:
            lineage_graph = {"nodes": [], "edges": []}
            
        return {"status": "success", "nodes": lineage_graph.get("nodes", []), "edges": lineage_graph.get("edges", [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/v1/dashboard/lineage")
async def get_dashboard_lineage(request: DashboardRequest):
    platform = request.platform.lower()
    creds = request.credentials or {}
    
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
            
        sql_query = QueryGenerator.generate_information_schema_sql(platform, db_name, schema_name)
        columns = snowflake_engine.execute_query(sql_query) if platform == "snowflake" else databricks_engine.execute_query(sql_query)
        
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


