import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()
BASE_URL = "http://127.0.0.1:8000/api/v1"
credentials = {
    "server_hostname": os.getenv("DATABRICKS_SERVER_HOSTNAME"),
    "http_path": os.getenv("DATABRICKS_HTTP_PATH"),
    "access_token": os.getenv("DATABRICKS_ACCESS_TOKEN")
}

print("Testing Metadata / Schemas in samples")
res = requests.post(f"{BASE_URL}/metadata/entities", json={
    "platform": "databricks",
    "entity_type": "schemas",
    "database_name": "samples",
    "credentials": credentials
})
print("Schemas Response:", res.status_code, res.json() if res.status_code == 200 else res.text)

print("\nTesting Metadata / Tables in samples.tpch")
res = requests.post(f"{BASE_URL}/metadata/entities", json={
    "platform": "databricks",
    "entity_type": "tables",
    "database_name": "samples",
    "schema_name": "tpch",
    "credentials": credentials
})
print("Tables Response:", res.status_code, res.json() if res.status_code == 200 else res.text)
