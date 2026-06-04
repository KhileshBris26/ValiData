import re

# 1. Update core/query_generator.py
with open('core/query_generator.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace generate_catalog_sql for snowflake
old_catalog_sql = """        if platform == "snowflake":
            return \"\"\"
            SELECT 
                t.TABLE_CATALOG AS DATABASE,
                t.TABLE_SCHEMA AS SCHEMA,
                t.TABLE_NAME AS NAME,
                'TABLE' AS TYPE,
                COALESCE(t.ROW_COUNT, 0) AS RECORDS,
                COUNT(c.COLUMN_NAME) AS ATTRIBUTES
            FROM SNOWFLAKE.ACCOUNT_USAGE.TABLES t
            LEFT JOIN SNOWFLAKE.ACCOUNT_USAGE.COLUMNS c 
              ON t.TABLE_CATALOG = c.TABLE_CATALOG 
              AND t.TABLE_SCHEMA = c.TABLE_SCHEMA 
              AND t.TABLE_NAME = c.TABLE_NAME
              AND c.DELETED IS NULL
            WHERE t.DELETED IS NULL
              AND UPPER(t.TABLE_CATALOG) NOT IN ('SNOWFLAKE', 'SNOWFLAKE_SAMPLE_DATA')
            GROUP BY 1, 2, 3, 4, 5
            ORDER BY t.TABLE_CATALOG, t.TABLE_SCHEMA, t.TABLE_NAME
            LIMIT 100;
            \"\"\""""

new_catalog_sql = """        if platform == "snowflake":
            return "SHOW TABLES IN ACCOUNT;"
"""
content = content.replace(old_catalog_sql, new_catalog_sql)

# Replace generate_metadata_sql for tables in snowflake
old_metadata_sql = """            elif entity_type == "tables":
                if not schema_name: raise ValueError("Schema name required for tables.")
                sql = f"SHOW TABLES IN SCHEMA {database_name}.{schema_name};" """

new_metadata_sql = """            elif entity_type == "tables":
                if not schema_name: raise ValueError("Schema name required for tables.")
                sql = f"SELECT TABLE_NAME AS NAME FROM {database_name}.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '{schema_name.upper()}' AND TABLE_TYPE = 'BASE TABLE';" """

content = content.replace(old_metadata_sql, new_metadata_sql)

with open('core/query_generator.py', 'w', encoding='utf-8') as f:
    f.write(content)


# 2. Update main.py get_catalog_tables
with open('main.py', 'r', encoding='utf-8') as f:
    main_content = f.read()

old_main_catalog = """        if request.platform == "snowflake":
            snowflake_engine.connect(request.credentials)
            result = snowflake_engine.execute_query(sql_query)
            snowflake_engine.disconnect()"""

new_main_catalog = """        if request.platform == "snowflake":
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
            snowflake_engine.disconnect()"""

main_content = main_content.replace(old_main_catalog, new_main_catalog)

with open('main.py', 'w', encoding='utf-8') as f:
    f.write(main_content)

print("Patch applied to fix Snowflake role fetching and catalog permissions!")
