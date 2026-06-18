import sqlglot
from sqlglot import exp
from collections import defaultdict
from typing import List, Dict, Any

class UsageAnalyzer:
    @staticmethod
    def analyze_queries(queries: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Parses raw SQL queries to extract table, column, and join usage frequencies.
        """
        table_usage = defaultdict(int)
        column_usage = defaultdict(int)
        join_keys = defaultdict(int)
        
        for row in queries:
            # Handle different casing from Snowflake vs Databricks
            sql = row.get("QUERY_TEXT") or row.get("query_text")
            if not sql:
                continue
            
            # Filter out Robin's internal lineage validation queries
            if "overlap_count" in sql.lower():
                continue
            
            try:
                # Parse the SQL query into an Abstract Syntax Tree (AST)
                # Setting error_level="IGNORE" allows sqlglot to do its best with dialect quirks
                parsed = sqlglot.parse_one(sql, read=None, error_level="IGNORE")
                if not parsed:
                    continue
                
                # Extract CTE names to ignore them as physical tables
                cte_names = set()
                for cte in parsed.find_all(exp.CTE):
                    if cte.alias:
                        cte_names.add(cte.alias.lower())
                
                # Extract Tables and Aliases
                tables = list(parsed.find_all(exp.Table))
                table_map = {} # alias -> real_name
                default_table = None
                
                for table in tables:
                    t_name = table.name.lower() if table.name else ""
                    
                    # Ignore CTEs
                    if t_name in cte_names:
                        continue
                        
                    t_db = table.db.lower() if table.db else ""
                    t_cat = table.catalog.lower() if table.catalog else ""
                    
                    parts = []
                    if t_cat: parts.append(t_cat)
                    if t_db: parts.append(t_db)
                    if t_name: parts.append(t_name)
                    
                    real_table_name = ".".join(parts)
                    
                    if real_table_name:
                        table_usage[real_table_name] += 1
                        alias = table.alias.lower() if table.alias else real_table_name
                        table_map[alias] = real_table_name
                        if not default_table:
                            default_table = real_table_name
                
                # Extract Columns
                for column in parsed.find_all(exp.Column):
                    col_name = column.name.lower()
                    if not col_name: continue
                    
                    table_ref = column.table.lower() if column.table else ""
                    real_table = table_map.get(table_ref) if table_ref else (default_table if len(tables) == 1 else "")
                    
                    full_col_name = f"{real_table}.{col_name}" if real_table else col_name
                    
                    # Only track columns that are definitively tied to a table
                    if "." in full_col_name:
                        column_usage[full_col_name] += 1
                        
                # Extract JOIN conditions
                for join in parsed.find_all(exp.Join):
                    on_clause = join.args.get("on")
                    if on_clause:
                        # Find equality conditions like a.id = b.id
                        for eq in on_clause.find_all(exp.EQ):
                            left = eq.left
                            right = eq.right
                            if isinstance(left, exp.Column) and isinstance(right, exp.Column):
                                l_table_ref = left.table.lower() if left.table else ""
                                l_real = table_map.get(l_table_ref) if l_table_ref else ""
                                l_full = f"{l_real}.{left.name.lower()}" if l_real else left.name.lower()
                                
                                r_table_ref = right.table.lower() if right.table else ""
                                r_real = table_map.get(r_table_ref) if r_table_ref else ""
                                r_full = f"{r_real}.{right.name.lower()}" if r_real else right.name.lower()
                                
                                # Sort to ensure consistent a=b vs b=a counting
                                keys = sorted([l_full, r_full])
                                key_str = f"{keys[0]} = {keys[1]}"
                                join_keys[key_str] += 1

            except Exception as e:
                # Ignore queries that cannot be parsed completely due to dialect specifics
                continue
                
        # Format top tables
        top_tables = []
        for k, v in table_usage.items():
            parts = k.split('.')
            if len(parts) >= 3:
                db, schema, tbl = parts[-3], parts[-2], parts[-1]
            elif len(parts) == 2:
                db, schema, tbl = "-", parts[0], parts[1]
            else:
                db, schema, tbl = "-", "-", parts[0]
            top_tables.append({"name": k, "database": db, "schema": schema, "table": tbl, "count": v})
            
        # Format top columns
        top_columns = []
        for k, v in column_usage.items():
            parts = k.split('.')
            if len(parts) >= 4:
                db, schema, tbl, col = parts[-4], parts[-3], parts[-2], parts[-1]
            elif len(parts) == 3:
                db, schema, tbl, col = "-", parts[0], parts[1], parts[2]
            elif len(parts) == 2:
                db, schema, tbl, col = "-", "-", parts[0], parts[1]
            else:
                db, schema, tbl, col = "-", "-", "-", parts[0]
            top_columns.append({"name": k, "database": db, "schema": schema, "table": tbl, "column": col, "count": v})

        return {
            "top_tables": sorted(top_tables, key=lambda x: x["count"], reverse=True)[:50],
            "top_columns": sorted(top_columns, key=lambda x: x["count"], reverse=True)[:50],
            "top_join_keys": sorted([{"name": k, "count": v} for k, v in join_keys.items()], key=lambda x: x["count"], reverse=True)[:50],
        }
