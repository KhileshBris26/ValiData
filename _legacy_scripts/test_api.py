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

print("Testing Metadata / Databases")
res = requests.post(f"{BASE_URL}/metadata/entities", json={
    "platform": "databricks",
    "entity_type": "databases",
    "credentials": credentials
})
print("Response:", res.status_code)
print(res.json() if res.status_code == 200 else res.text)

print("\nTesting Lineage Inference")
res2 = requests.post(f"{BASE_URL}/lineage/infer", json={
    "platform": "databricks",
    "database_name": "samples",
    "schema_name": "tpch",
    "credentials": credentials
})
print("Response:", res2.status_code)
if res2.status_code == 200:
    data = res2.json()
    print("Success. Found nodes:", len(data.get("nodes", [])))
    print("Found edges:", len(data.get("edges", [])))
else:
    print(res2.text)
