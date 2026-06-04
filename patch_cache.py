import re

# 1. Patch TableDetail.tsx
with open('frontend/src/pages/TableDetail.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the three small buttons
old_btn_group = """          <div className="btn-group">
            <ShieldCheck size={20} className="icon-btn" />
            <RotateCw size={20} className="icon-btn" />
            <BarChart2 size={20} className="icon-btn" />
          </div>"""
content = content.replace(old_btn_group, "")

# Add cache buster to the API call
old_api_call = "axios.get(`${API_BASE}/dashboard/executions/latest?table_name=${encodeURIComponent(table)}`);"
new_api_call = "axios.get(`${API_BASE}/dashboard/executions/latest?table_name=${encodeURIComponent(table)}&_t=${Date.now()}`);"
content = content.replace(old_api_call, new_api_call)

with open('frontend/src/pages/TableDetail.tsx', 'w', encoding='utf-8') as f:
    f.write(content)


# 2. Patch DataQualityDetail.tsx
with open('frontend/src/pages/DataQualityDetail.tsx', 'r', encoding='utf-8') as f:
    content2 = f.read()

# Add cache buster to the API call
old_api_call2 = "axios.get(`${API_BASE}/dashboard/executions/latest?table_name=${encodeURIComponent(table)}`);"
new_api_call2 = "axios.get(`${API_BASE}/dashboard/executions/latest?table_name=${encodeURIComponent(table)}&_t=${Date.now()}`);"
content2 = content2.replace(old_api_call2, new_api_call2)

with open('frontend/src/pages/DataQualityDetail.tsx', 'w', encoding='utf-8') as f:
    f.write(content2)

print("Both files patched successfully.")
