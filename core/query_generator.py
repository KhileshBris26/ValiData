class QueryGenerator:
    @staticmethod
    def generate_dq_rule_sql(platform: str, table: str, column: str, rule_type: str, rule_params: dict = None) -> str:
        """
        Generates SQL for various Data Quality dimensions.
        """
        rule_params = rule_params or {}
        platform = platform.lower()
        
        # Base template components
        base_select = f"'{table}' AS table_name, '{column}' AS column_name, '{rule_type}' AS rule_type"
        
        if rule_type == "NULL_CHECK":
            return f"""
            SELECT {base_select},
                   COUNT(*) AS total_rows,
                   SUM(CASE WHEN {column} IS NULL THEN 1 ELSE 0 END) AS failed_rows
            FROM {table}
            """
            
        elif rule_type == "BLANK_CHECK":
            return f"""
            SELECT {base_select},
                   COUNT(*) AS total_rows,
                   SUM(CASE WHEN TRIM(CAST({column} AS STRING)) = '' THEN 1 ELSE 0 END) AS failed_rows
            FROM {table}
            """
            
        elif rule_type == "UNIQUE_CHECK":
            return f"""
            SELECT {base_select},
                   COUNT(*) AS total_rows,
                   COUNT(DISTINCT {column}) AS distinct_values,
                   COUNT(*) - COUNT(DISTINCT {column}) AS failed_rows
            FROM {table}
            """
            
        elif rule_type == "RANGE_CHECK":
            min_val = rule_params.get('min_val', 0)
            max_val = rule_params.get('max_val', 0)
            return f"""
            SELECT {base_select},
                   COUNT(*) AS total_rows,
                   SUM(CASE WHEN {column} < {min_val} OR {column} > {max_val} THEN 1 ELSE 0 END) AS failed_rows
            FROM {table}
            """
            
        elif rule_type == "PATTERN_CHECK":
            pattern = rule_params.get('pattern', '')
            safe_pattern = pattern.replace("'", "''")
            
            if platform == "snowflake":
                # Snowflake uses REGEXP_LIKE
                return f"""
                SELECT {base_select},
                       COUNT(*) AS total_rows,
                       SUM(CASE WHEN REGEXP_LIKE(CAST({column} AS STRING), '{safe_pattern}') THEN 0 ELSE 1 END) AS failed_rows
                FROM {table}
                """
            elif platform == "databricks":
                # Databricks uses rlike or regexp
                return f"""
                SELECT {base_select},
                       COUNT(*) AS total_rows,
                       SUM(CASE WHEN CAST({column} AS STRING) rlike '{safe_pattern}' THEN 0 ELSE 1 END) AS failed_rows
                FROM {table}
                """
                
        elif rule_type == "MIN_MAX_PROFILE":
            return f"""
            SELECT {base_select},
                   COUNT(*) AS total_rows,
                   CAST(MIN({column}) AS STRING) AS min_value,
                   CAST(MAX({column}) AS STRING) AS max_value,
                   CAST(AVG({column}) AS STRING) AS avg_value,
                   0 AS failed_rows
            FROM {table}
            """
            
        raise ValueError(f"Unsupported rule type: {rule_type}")

    @staticmethod
    def generate_ai_suggestion_sql(platform: str, table: str, column: str) -> str:
        """
        Generates the platform-specific SQL to invoke Native LLMs for column rules.
        """
        prompt = f"Act as an expert Data Steward. I have a column named {column} in a table named {table}. Suggest 3 precise business data quality rules to validate this column. Return ONLY the 3 rules as a numbered list in plain text."
        
        # Escape any single quotes to prevent SQL syntax errors when wrapped in a SQL string literal
        safe_prompt = prompt.replace("'", "''")
        
        if platform.lower() == "snowflake":
            sql = f"SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large', '{safe_prompt}') AS ai_suggestion"
        elif platform.lower() == "databricks":
            sql = f"SELECT ai_query('databricks-meta-llama-3-3-70b-instruct', '{safe_prompt}') AS ai_suggestion"
        else:
            raise ValueError(f"Unsupported platform for AI pushdown: {platform}")
            
        return sql

    @staticmethod
    def generate_chat_agent_sql(platform: str, system_prompt: str, user_message: str) -> str:
        """
        Generates the platform-specific SQL to invoke Native LLMs for chat agent interaction.
        """
        full_prompt = f"{system_prompt}\n\nUser Message: {user_message}"
        safe_prompt = full_prompt.replace("'", "''")
        
        if platform.lower() == "snowflake":
            sql = f"SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large', '{safe_prompt}') AS ai_response"
        elif platform.lower() == "databricks":
            sql = f"SELECT ai_query('databricks-meta-llama-3-3-70b-instruct', '{safe_prompt}') AS ai_response"
        else:
            raise ValueError(f"Unsupported platform for AI pushdown: {platform}")
            
        return sql

    @staticmethod
    def generate_table_summary_sql(platform: str, table: str) -> str:
        """
        Generates SQL to invoke Native LLMs for generating a table summary.
        """
        prompt = f"Act as an expert Data Architect. Describe the purpose and likely content of a database table named '{table}'. Be concise and professional. Return ONLY the description text."
        safe_prompt = prompt.replace("'", "''")
        
        if platform.lower() == "snowflake":
            return f"SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large', '{safe_prompt}') AS table_summary"
        elif platform.lower() == "databricks":
            return f"SELECT ai_query('databricks-meta-llama-3-3-70b-instruct', '{safe_prompt}') AS table_summary"
        return ""

    @staticmethod
    def generate_metadata_sql(platform: str, entity_type: str, database_name: str = None, schema_name: str = None, table_name: str = None) -> str:
        sql = ""
        platform = platform.lower()
        if platform == "snowflake":
            if entity_type == "databases":
                sql = "SHOW DATABASES;"
            elif entity_type == "schemas":
                if not database_name: raise ValueError("Database name required for schemas.")
                sql = f"SHOW SCHEMAS IN DATABASE {database_name};"
            elif entity_type == "tables":
                if not schema_name: raise ValueError("Schema name required for tables.")
                sql = f"SHOW TABLES IN SCHEMA {database_name}.{schema_name};"
            elif entity_type == "columns":
                if not table_name: raise ValueError("Table name required for columns.")
                # snowflake SHOW COLUMNS takes fully qualified table name if you provide the exact identifier, but often `IN TABLE x.y.z` is preferred.
                sql = f"SHOW COLUMNS IN TABLE {database_name}.{schema_name}.{table_name};"
        elif platform == "databricks":
            if entity_type == "databases":
                sql = "SHOW CATALOGS;"
            elif entity_type == "schemas":
                if not database_name: raise ValueError("Catalog name required for schemas.")
                sql = f"SHOW SCHEMAS IN {database_name};"
            elif entity_type == "tables":
                if not schema_name: raise ValueError("Schema name required for tables.")
                sql = f"SHOW TABLES IN {database_name}.{schema_name};"
            elif entity_type == "columns":
                if not table_name: raise ValueError("Table name required for columns.")
                sql = f"DESCRIBE TABLE {database_name}.{schema_name}.{table_name};"
        
        if not sql:
            raise ValueError(f"Invalid metadata request: {platform} - {entity_type}")
        return sql

    @staticmethod
    def generate_information_schema_sql(platform: str, database_name: str, schema_name: str) -> str:
        """
        Generates the SQL to extract all tables and columns from the information schema.
        """
        platform = platform.lower()
        if platform == "snowflake":
            # For Snowflake, the INFORMATION_SCHEMA is local to each database.
            # We must query database.information_schema.columns
            return f"""
            SELECT 
                TABLE_NAME, 
                COLUMN_NAME, 
                DATA_TYPE 
            FROM {database_name}.INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = '{schema_name.upper()}'
            """
        elif platform == "databricks":
            # For Unity Catalog, system.information_schema contains everything
            return f"""
            SELECT 
                table_name AS TABLE_NAME, 
                column_name AS COLUMN_NAME, 
                data_type AS DATA_TYPE 
            FROM system.information_schema.columns 
            WHERE table_schema = '{schema_name}' 
              AND table_catalog = '{database_name}'
            """
        else:
            raise ValueError(f"Unsupported platform: {platform}")

    @staticmethod
    def generate_overlap_validation_sql(platform: str, db: str, schema: str, t1: str, col1: str, t2: str, col2: str, use_sample: bool = True) -> str:
        """
        Generates SQL to validate the data overlap between two candidate columns.
        """
        sample_clause = "TABLESAMPLE (10000 ROWS)" if use_sample and platform.lower() == "snowflake" else "LIMIT 10000" if use_sample else ""
        
        # We will use a simple INNER JOIN count to see if there is any overlap.
        # If overlap_count > 0, we have a confirmed relationship.
        if platform.lower() == "snowflake":
            # Snowflake supports TABLESAMPLE
            sample_t1 = f"TABLESAMPLE (1000 ROWS)" if use_sample else ""
            sample_t2 = f"TABLESAMPLE (1000 ROWS)" if use_sample else ""
            return f"""
            SELECT COUNT(*) as overlap_count FROM (
                SELECT {col1} FROM {db}.{schema}.{t1} {sample_t1}
            ) a
            INNER JOIN (
                SELECT {col2} FROM {db}.{schema}.{t2} {sample_t2}
            ) b ON a.{col1} = b.{col2}
            LIMIT 1
            """
        elif platform.lower() == "databricks":
            # Databricks supports TABLESAMPLE as well but syntax might vary, let's use limit in subquery
            limit_clause = "LIMIT 1000" if use_sample else ""
            return f"""
            SELECT COUNT(*) as overlap_count FROM (
                SELECT {col1} FROM {db}.{schema}.{t1} {limit_clause}
            ) a
            INNER JOIN (
                SELECT {col2} FROM {db}.{schema}.{t2} {limit_clause}
            ) b ON a.{col1} = b.{col2}
            LIMIT 1
            """
        return ""

    @staticmethod
    def generate_bulk_overlap_validation_sql(platform: str, db: str, schema: str, edges: list, use_sample: bool = True) -> str:
        """
        Generates a single SQL query using CTEs and UNION ALL to validate multiple edges at once.
        'edges' should be a list of dicts: {"id": "edge_id", "source": "t1", "col1": "c1", "target": "t2", "col2": "c2"}
        """
        if not edges:
            return ""
            
        platform = platform.lower()
        cte_parts = []
        select_parts = []
        
        for idx, edge in enumerate(edges):
            t1 = edge["source"]
            col1 = edge["data"].get("col1")
            t2 = edge["target"]
            col2 = edge["data"].get("col2")
            edge_id = edge["id"]
            
            if not col1 or not col2:
                continue
                
            cte_name = f"val_{idx}"
            
            if platform == "snowflake":
                sample_t1 = "TABLESAMPLE (1000 ROWS)" if use_sample else ""
                sample_t2 = "TABLESAMPLE (1000 ROWS)" if use_sample else ""
                cte_parts.append(f"""
                {cte_name} AS (
                    SELECT COUNT(*) as overlap_count FROM (
                        SELECT {col1} FROM {db}.{schema}.{t1} {sample_t1}
                    ) a
                    INNER JOIN (
                        SELECT {col2} FROM {db}.{schema}.{t2} {sample_t2}
                    ) b ON a.{col1} = b.{col2}
                )""")
            elif platform == "databricks":
                limit_clause = "LIMIT 1000" if use_sample else ""
                cte_parts.append(f"""
                {cte_name} AS (
                    SELECT COUNT(*) as overlap_count FROM (
                        SELECT {col1} FROM {db}.{schema}.{t1} {limit_clause}
                    ) a
                    INNER JOIN (
                        SELECT {col2} FROM {db}.{schema}.{t2} {limit_clause}
                    ) b ON a.{col1} = b.{col2}
                )""")
            
            select_parts.append(f"SELECT '{edge_id}' as edge_id, overlap_count FROM {cte_name}")
            
        if not select_parts:
            return ""
            
        sql = "WITH " + ",\n".join(cte_parts) + "\n" + "\nUNION ALL\n".join(select_parts)
        return sql
        """
        Generates query to fetch query history for usage analytics.
        """
        if platform.lower() == "snowflake":
            db_filter = f"AND DATABASE_NAME = '{database_name}'" if database_name else ""
            return f"""
            SELECT QUERY_TEXT 
            FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
            WHERE START_TIME >= CURRENT_TIMESTAMP() - INTERVAL '{days_back} DAYS'
              AND EXECUTION_STATUS = 'SUCCESS'
              AND QUERY_TYPE IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE')
              {db_filter}
            ORDER BY START_TIME DESC
            LIMIT 10000;
            """
        elif platform.lower() == "databricks":
            # Databricks logs queries globally, so we filter by text if a database/catalog is provided
            db_filter = f"AND lower(statement_text) LIKE '%{database_name.lower()}.%'" if database_name else ""
            return f"""
            SELECT statement_text as QUERY_TEXT 
            FROM system.query.history 
            WHERE start_time >= current_timestamp() - interval {days_back} days
              AND error_message IS NULL
              AND lower(statement_text) LIKE 'select%'
              {db_filter}
            ORDER BY start_time DESC
            LIMIT 10000;
            """
        return ""
    @staticmethod
    def generate_preview_sql(platform: str, db: str, schema: str, table: str, limit: int = 100) -> str:
        """
        Generates SQL to fetch a sample of data for preview.
        """
        if platform.lower() == "snowflake":
            return f'SELECT * FROM "{db.upper()}"."{schema.upper()}"."{table.upper()}" LIMIT {limit}'
        elif platform.lower() == "databricks":
            return f"SELECT * FROM `{db}`.`{schema}`.`{table}` LIMIT {limit}"
        return ""

    @staticmethod
    def generate_catalog_sql(platform: str) -> str:
        """
        Generates SQL to fetch all tables across the entire account/catalog, 
        filtering out known internal system objects while keeping user schemas like PUBLIC.
        """
        platform = platform.lower()
        if platform == "snowflake":
            return """
            SELECT 
                t.TABLE_CATALOG AS DATABASE,
                t.TABLE_SCHEMA AS SCHEMA,
                t.TABLE_NAME AS NAME,
                'TABLE' AS TYPE,
                COALESCE(t.ROW_COUNT, 0) AS RECORDS,
                10 AS ATTRIBUTES
            FROM SNOWFLAKE.ACCOUNT_USAGE.TABLES t
            WHERE t.DELETED IS NULL
              AND UPPER(t.TABLE_CATALOG) NOT IN ('SNOWFLAKE', 'SNOWFLAKE_SAMPLE_DATA')
            ORDER BY t.TABLE_CATALOG, t.TABLE_SCHEMA, t.TABLE_NAME
            LIMIT 100;
            """
        elif platform == "databricks":
            return """
            SELECT 
                t.table_catalog AS DATABASE,
                t.table_schema AS SCHEMA,
                t.table_name AS NAME,
                'TABLE' AS TYPE,
                0 AS RECORDS,
                COALESCE(c.ATTR_COUNT, 0) AS ATTRIBUTES
            FROM system.information_schema.tables t
            LEFT JOIN (
                SELECT table_catalog, table_schema, table_name, COUNT(*) as ATTR_COUNT
                FROM system.information_schema.columns
                GROUP BY table_catalog, table_schema, table_name
            ) c ON t.table_catalog = c.table_catalog AND t.table_schema = c.table_schema AND t.table_name = c.table_name
            WHERE UPPER(t.table_catalog) != 'SYSTEM'
              AND UPPER(t.table_schema) NOT IN ('INFORMATION_SCHEMA', '__DATABRICKS_INTERNAL')
              AND t.table_name NOT LIKE '_sqldashboards_%'
              AND t.table_name NOT LIKE '_metadata_%'
            ORDER BY t.table_catalog, t.table_schema, t.table_name
            LIMIT 1000;
            """
        return ""
