from app.shared_resources.core.query_generator import QueryGenerator
from app.shared_resources.core.lineage_engine import LineageEngine
from app.shared_resources.core.usage_analyzer import UsageAnalyzer

class DatabricksService:
    def __init__(self, engine):
        """
        Initialize with the Databricks connector engine.
        """
        self.engine = engine

    def get_catalog_tables(self, credentials: dict) -> list:
        """
        Fetch and map catalog tables for Databricks.
        """
        sql_query = QueryGenerator.generate_catalog_sql("databricks")
        try:
            self.engine.connect(credentials)
            result = self.engine.execute_query(sql_query)
            return result or []
        finally:
            self.engine.disconnect()

    def get_table_preview(self, credentials: dict, db: str, schema: str, table: str) -> list:
        """
        Fetch table preview for Databricks.
        """
        sql_query = QueryGenerator.generate_preview_sql("databricks", db, schema, table)
        try:
            self.engine.connect(credentials)
            result = self.engine.execute_query(sql_query)
            return result or []
        finally:
            self.engine.disconnect()

    def infer_lineage(self, credentials: dict, db: str, schema: str) -> dict:
        """
        Infer lineage graph for Databricks.
        """
        sql_query = QueryGenerator.generate_information_schema_sql("databricks", db, schema)
        try:
            self.engine.connect(credentials)
            result = self.engine.execute_query(sql_query)
            return LineageEngine.infer_relationships(result)
        finally:
            self.engine.disconnect()

    def get_usage_analytics(self, credentials: dict, days_back: int) -> dict:
        """
        Get usage analytics for Databricks.
        """
        sql_query = QueryGenerator.generate_query_history_sql("databricks", days_back)
        try:
            self.engine.connect(credentials)
            result = self.engine.execute_query(sql_query)
            return UsageAnalyzer.analyze_queries(result)
        finally:
            self.engine.disconnect()

    def generate_table_summary(self, credentials: dict, table_name: str) -> str:
        """
        Generate table summary for Databricks.
        """
        sql_query = QueryGenerator.generate_table_summary_sql("databricks", table_name)
        try:
            self.engine.connect(credentials)
            result = self.engine.execute_query(sql_query)
            return result[0].get('TABLE_SUMMARY') or result[0].get('table_summary') if result else ""
        finally:
            self.engine.disconnect()

    def suggest_rules_ai(self, credentials: dict, table: str, column: str) -> list:
        """
        Suggest rules via AI for Databricks.
        """
        sql_query = QueryGenerator.generate_ai_suggestion_sql("databricks", table, column)
        try:
            self.engine.connect(credentials)
            result = self.engine.execute_query(sql_query)
            return result or []
        finally:
            self.engine.disconnect()

    def execute_dq_rule(self, credentials: dict, sql_query: str) -> list:
        """
        Execute Data Quality rule on Databricks.
        """
        try:
            self.engine.connect(credentials)
            raw_result = self.engine.execute_query(sql_query)
            return [{k.upper(): v for k, v in dict(row).items()} for row in raw_result] if raw_result else []
        finally:
            self.engine.disconnect()

    def fetch_column_metadata(self, credentials: dict, db: str, schema: str, table: str, columns: list) -> list:
        """
        Fetch column metadata for Databricks.
        """
        col_list_str = ",".join([f"'{c}'" for c in columns])
        meta_query = f'''
            SELECT column_name AS COLUMN_NAME, data_type AS DATA_TYPE, is_nullable AS IS_NULLABLE
            FROM system.information_schema.columns 
            WHERE table_catalog = '{db}'
            AND table_schema = '{schema}'
            AND table_name = '{table}'
            AND column_name IN ({col_list_str})
        '''
        try:
            self.engine.connect(credentials)
            return self.engine.execute_query(meta_query) or []
        finally:
            self.engine.disconnect()

    def sample_failed_records(self, credentials: dict, table_name: str, failed_checks: list) -> list:
        """
        Fetch sample failed records for Databricks.
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
        Fetch query history for warehouse analytics on Databricks.
        """
        try:
            self.engine.connect(credentials)
            try:
                sql = "SELECT statement_text as QUERY_TEXT FROM system.query.history ORDER BY start_time DESC LIMIT 500"
                return self.engine.execute_query(sql)
            except Exception as e:
                print(f"Query history retrieval failed: {e}")
                return []
        except Exception as e:
            print(f"Connection failed: {e}")
            return []
        finally:
            self.engine.disconnect()

