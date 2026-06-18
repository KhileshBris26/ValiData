import re

with open('frontend/src/pages/TableDetail.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Helper logic to get credentials:
# credentials: (() => { const saved = localStorage.getItem('robin_credentials'); if (saved) { const creds = JSON.parse(saved); return creds[platform || 'snowflake']; } return null; })(),

# We will inject this line after `platform: platform || "snowflake",`
injection = """
        credentials: (() => { const saved = localStorage.getItem('robin_credentials'); if (saved) { const creds = JSON.parse(saved); return creds[platform || 'snowflake']; } return null; })(),
"""

def replacer(match):
    prefix = match.group(0)
    return prefix + injection.lstrip()

# Replace in `fetchTableMetadata` (fetch)
pattern1 = r'platform,\s+database_name: database,\s+schema_name: schema,\s+table_name: table,\s+column_name: ""'
content = re.sub(pattern1, r'platform,\n        credentials: (() => { const saved = localStorage.getItem("robin_credentials"); if (saved) { const creds = JSON.parse(saved); return creds[platform || "snowflake"]; } return null; })(),\n        database_name: database,\n        schema_name: schema,\n        table_name: table,\n        column_name: ""', content)

# Replace in save calls
pattern2 = r'platform: platform \|\| "snowflake",'
content = re.sub(pattern2, r'platform: platform || "snowflake",\n        credentials: (() => { const saved = localStorage.getItem("robin_credentials"); if (saved) { const creds = JSON.parse(saved); return creds[platform || "snowflake"]; } return null; })(),', content)

with open('frontend/src/pages/TableDetail.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched TableDetail.tsx successfully.")
