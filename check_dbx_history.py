import os
from dotenv import load_dotenv
load_dotenv()
from connectors.databricks_connector import DatabricksConnector
try:
    conn = DatabricksConnector()
    conn.connect()
    res = conn.execute_query("DESCRIBE system.query.history")
    for r in res:
        print(r['col_name'])
except Exception as e:
    print(e)
