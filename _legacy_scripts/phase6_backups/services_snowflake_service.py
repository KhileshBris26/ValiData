from core.query_generator import QueryGenerator
from core.lineage_engine import LineageEngine
from core.usage_analyzer import UsageAnalyzer

class SnowflakeService:
    def __init__(self, engine):
        """
        Initialize with the Snowflake connector engine.
        """
        self.engine = engine

    def get_catalog_tables(self, credentials: dict) -> list:
        """
        Fetch and map catalog tables for Snowflake.
        """
        sql_query = QueryGenerator.generate_catalog_sql("snowflake")
        try:
            self.engine.connect(credentials)
            result = self.engine.execute_query(sql_query)
            mapped = []
            if result:
                for r in result:
                    # snowflake returns dict cursor
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
            return mapped
        finally:
            self.engine.disconnect()

    def get_table_preview(self, credentials: dict, db: str, schema: str, table: str) -> list:
        """
        Fetch table preview for Snowflake.
        """
        sql_query = QueryGenerator.generate_preview_sql("snowflake", db, schema, table)
        try:
            self.engine.connect(credentials)
            result = self.engine.execute_query(sql_query)
            return result or []
        finally:
            self.engine.disconnect()

    def infer_lineage(self, credentials: dict, db: str, schema: str) -> dict:
        """
        Infer lineage graph for Snowflake.
        """
        sql_query = QueryGenerator.generate_information_schema_sql("snowflake", db, schema)
        try:
            self.engine.connect(credentials)
            result = self.engine.execute_query(sql_query)
            return LineageEngine.infer_relationships(result)
        finally:
            self.engine.disconnect()

    def get_usage_analytics(self, credentials: dict, days_back: int) -> dict:
        """
        Get usage analytics for Snowflake.
        """
        sql_query = QueryGenerator.generate_query_history_sql("snowflake", days_back)
        try:
            self.engine.connect(credentials)
            result = self.engine.execute_query(sql_query)
            return UsageAnalyzer.analyze_queries(result)
        finally:
            self.engine.disconnect()

    def generate_table_summary(self, credentials: dict, table_name: str) -> str:
        """
        Generate table summary for Snowflake.
        """
        sql_query = QueryGenerator.generate_table_summary_sql("snowflake", table_name)
        try:
            self.engine.connect(credentials)
            result = self.engine.execute_query(sql_query)
            return result[0].get('TABLE_SUMMARY') or result[0].get('table_summary') if result else ""
        finally:
            self.engine.disconnect()

    def suggest_rules_ai(self, credentials: dict, table: str, column: str) -> list:
        """
        Suggest rules via AI for Snowflake.
        """
        sql_query = QueryGenerator.generate_ai_suggestion_sql("snowflake", table, column)
        try:
            self.engine.connect(credentials)
            result = self.engine.execute_query(sql_query)
            return result or []
        finally:
            self.engine.disconnect()

    def execute_dq_rule(self, credentials: dict, sql_query: str) -> list:
        """
        Execute Data Quality rule on Snowflake.
        """
        try:
            self.engine.connect(credentials)
            raw_result = self.engine.execute_query(sql_query)
            return [{k.upper(): v for k, v in dict(row).items()} for row in raw_result] if raw_result else []
        finally:
            self.engine.disconnect()

    def fetch_column_metadata(self, credentials: dict, db: str, schema: str, table: str, columns: list) -> list:
        """
        Fetch column metadata for Snowflake.
        """
        col_list_str = ",".join([f"'{c}'" for c in columns])
        meta_query = f'''
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
            FROM {db}.INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = '{schema}'
            AND TABLE_NAME = '{table}'
            AND COLUMN_NAME IN ({col_list_str})
        '''
        try:
            self.engine.connect(credentials)
            return self.engine.execute_query(meta_query) or []
        finally:
            self.engine.disconnect()

    def sample_failed_records(self, credentials: dict, table_name: str, failed_checks: list) -> list:
        """
        Fetch sample failed records for Snowflake.
        """
        groups = []
        try:
            self.engine.connect(credentials)
            for check in failed_checks:
                col = check.column_name
                rule = check.rule_type.upper()
                if "UNIQUE" in rule:
                    sql = f"""
                        SELECT '{col}' AS ATTRIBUTE_NAME, 'Unique Check' AS DQ_CHECK, a.*
                        FROM {table_name} a
                        JOIN (
                            SELECT {col} FROM {table_name} GROUP BY {col} HAVING COUNT(*) > 1
                        ) d ON a.{col} = d.{col}
                        ORDER BY a.{col} LIMIT 5
                    """
                elif "NULL" in rule:
                    sql = f"""
                        SELECT '{col}' AS ATTRIBUTE_NAME, 'Null Check' AS DQ_CHECK, *
                        FROM {table_name} WHERE {col} IS NULL LIMIT 5
                    """
                else:
                    continue

                try:
                    raw_rows = self.engine.execute_query(sql)
                    if not raw_rows:
                        continue
                    columns = [k.lower() for k in raw_rows[0].keys()]
                    rows = [[str(row[k]) for k in raw_rows[0].keys()] for row in raw_rows]
                    groups.append({
                        "column_name": col,
                        "rule_type": "Unique Check" if "UNIQUE" in rule else "Null Check",
                        "columns": columns,
                        "rows": rows
                    })
                except Exception as e:
                    print(f"Sample query failed for {col} / {rule}: {e}")
            return groups
        finally:
            self.engine.disconnect()

    def get_dashboard_warehouse_analytics_queries(self, credentials: dict) -> list:
        """
        Fetch query history for warehouse analytics on Snowflake.
        """
        try:
            self.engine.connect(credentials)
            try:
                sql = "SELECT QUERY_TEXT FROM TABLE(INFORMATION_SCHEMA.QUERY_HISTORY(RESULT_LIMIT => 500)) ORDER BY START_TIME DESC"
                return self.engine.execute_query(sql)
            except Exception:
                sql = "SELECT QUERY_TEXT FROM TABLE(INFORMATION_SCHEMA.QUERY_HISTORY_BY_SESSION(RESULT_LIMIT => 500)) ORDER BY START_TIME DESC"
                return self.engine.execute_query(sql)
        except Exception as e:
            print(f"Query history retrieval failed: {e}")
            return []
        finally:
            self.engine.disconnect()
