from typing import List, Dict, Any, Set
from thefuzz import fuzz

class LineageEngine:
    # Common generic columns that should NOT be used to infer foreign keys automatically
    IGNORE_COLUMNS = {
        'id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'is_active', 'is_deleted', 
        'name', 'status', 'type', 'description',
        'load_date_ts', 'load_date', 'record_source', 'load_cycle_id', 'hash_diff',
        'last_update'
    }

    @staticmethod
    def infer_relationships(raw_columns: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Takes raw rows from INFORMATION_SCHEMA.COLUMNS and infers relationships.
        Expected keys in raw_columns: 'TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE'
        Returns a dictionary with 'nodes' (tables) and 'edges' (relationships).
        """
        tables = {}
        
        # Normalize and group columns by table
        for row in raw_columns:
            # Handle case sensitivity from different DB drivers
            table_name = row.get('TABLE_NAME') or row.get('table_name')
            col_name = row.get('COLUMN_NAME') or row.get('column_name')
            data_type = row.get('DATA_TYPE') or row.get('data_type')
            
            if not table_name or not col_name:
                continue
                
            table_name = str(table_name).upper()
            col_name = str(col_name).lower()
            
            if table_name not in tables:
                tables[table_name] = {}
            
            tables[table_name][col_name] = data_type
            
        nodes = []
        edges = []
        edge_set = set() # To prevent duplicates
        
        # 1. Create Nodes
        for idx, (t_name, cols) in enumerate(tables.items()):
            # Format for React Flow
            nodes.append({
                "id": t_name,
                "type": "customTable", # We will build a custom node in React Flow
                "data": { 
                    "label": t_name,
                    "columns": [{"name": c, "type": t} for c, t in cols.items()]
                },
                # Distribute nodes in a grid initially (React Flow can auto-layout later with dagre, but this is a fallback)
                "position": { "x": (idx % 3) * 350, "y": (idx // 3) * 200 }
            })

        # LAYER_SCORES based on Data Vault 2.0 / common architecture
        # Lower score means more "upstream" (Source -> Hub -> Link/Sat)
        LAYER_SCORES = {
            'STG_': 0, 'RAW_': 0, 'SRC_': 0,
            'H_': 1, 'HUB_': 1,
            'L_': 2, 'LNK_': 2, 'LINK_': 2,
            'S_': 3, 'SAT_': 3,
            'P_': 4, 'PIT_': 4, 'B_': 4, 'BRG_': 4
        }

        def get_score(name: str):
            name_up = name.upper()
            for prefix, score in LAYER_SCORES.items():
                if name_up.startswith(prefix):
                    return score
            return 10 # Default for unknown tables

        # 2. Infer Edges
        table_names = list(tables.keys())
        
        for i in range(len(table_names)):
            for j in range(i + 1, len(table_names)):
                t1 = table_names[i]
                t2 = table_names[j]
                
                # Determine direction based on layer hierarchy
                score1 = get_score(t1)
                score2 = get_score(t2)
                
                # Special Case: Hubs and other same-layer tables should not link via exact match
                if score1 == score2 and score1 < 5:
                    # Only allow explicit FK conventions if we want, but definitely not generic exact matches
                    # For now, skip same-layer edges to keep it clean
                    continue

                if score1 < score2:
                    source, target = t1, t2
                elif score2 < score1:
                    source, target = t2, t1
                else:
                    # Tie-breaker: alphabetical to ensure deterministic direction
                    source, target = (t1, t2) if t1 < t2 else (t2, t1)
                
                cols1 = tables[source]
                cols2 = tables[target]
                
                # Rule A: Exact Name Match (excluding generic names)
                common_cols = set(cols1.keys()).intersection(set(cols2.keys()))
                valid_common = [c for c in common_cols if c not in LineageEngine.IGNORE_COLUMNS]
                
                for c in valid_common:
                    # Verify data type compatibility (rough check)
                    type1 = str(cols1[c]).lower()
                    type2 = str(cols2[c]).lower()
                    is_numeric1 = any(x in type1 for x in ['int', 'number', 'float', 'double', 'decimal'])
                    is_numeric2 = any(x in type2 for x in ['int', 'number', 'float', 'double', 'decimal'])
                    
                    if is_numeric1 == is_numeric2: # Both numeric or both non-numeric
                        edge_id = f"e_{source}_{target}_{c}"
                        if edge_id not in edge_set:
                            edges.append({
                                "id": edge_id,
                                "source": source,
                                "target": target,
                                "label": c,
                                "type": "smoothstep",
                                "animated": True,
                                "data": {
                                    "col1": c,
                                    "col2": c,
                                    "match_type": "exact"
                                }
                            })
                            edge_set.add(edge_id)
                
                # Rule B: Foreign Key Naming Convention
                s_lower = source.lower().rstrip('s')
                s_fk = f"{s_lower}_id"
                if s_fk in cols2 and 'id' in cols1:
                    edge_id = f"e_{source}_{target}_fk_{s_fk}"
                    if edge_id not in edge_set:
                        edges.append({
                            "id": edge_id,
                            "source": source,
                            "target": target,
                            "label": f"id = {s_fk}",
                            "type": "smoothstep",
                            "animated": True,
                            "data": { "col1": "id", "col2": s_fk, "match_type": "fk_convention" }
                        })
                        edge_set.add(edge_id)

                t_lower = target.lower().rstrip('s')
                t_fk = f"{t_lower}_id"
                if t_fk in cols1 and 'id' in cols2:
                    edge_id = f"e_{target}_{source}_fk_{t_fk}"
                    if edge_id not in edge_set:
                        edges.append({
                            "id": edge_id,
                            "source": target,
                            "target": source,
                            "label": f"id = {t_fk}",
                            "type": "smoothstep",
                            "animated": True,
                            "data": { "col1": "id", "col2": t_fk, "match_type": "fk_convention" }
                        })
                        edge_set.add(edge_id)

                # Rule C: Fuzzy Naming Match
                for c1, t_c1 in cols1.items():
                    if c1 in LineageEngine.IGNORE_COLUMNS: continue
                    for c2, t_c2 in cols2.items():
                        if c2 in LineageEngine.IGNORE_COLUMNS: continue
                        
                        if 'id' in c1 and 'id' in c2:
                            score = fuzz.ratio(c1, c2)
                            if score >= 85:
                                type1 = str(t_c1).lower()
                                type2 = str(t_c2).lower()
                                is_numeric1 = any(x in type1 for x in ['int', 'number', 'float', 'double', 'decimal'])
                                is_numeric2 = any(x in type2 for x in ['int', 'number', 'float', 'double', 'decimal'])
                                
                                if is_numeric1 == is_numeric2:
                                    edge_id = f"e_{source}_{target}_fuzzy_{c1}_{c2}"
                                    if edge_id not in edge_set:
                                        edges.append({
                                            "id": edge_id,
                                            "source": source,
                                            "target": target,
                                            "label": f"fuzzy: {c1} ≈ {c2}",
                                            "type": "smoothstep",
                                            "animated": True,
                                            "data": { "col1": c1, "col2": c2, "match_type": "fuzzy" }
                                        })
                                        edge_set.add(edge_id)

        return {
            "nodes": nodes,
            "edges": edges
        }
