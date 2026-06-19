import shutil, os

base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
legacy = os.path.join(base, '_legacy_scripts')
backup_dir = os.path.join(legacy, 'phase6_backups')
new_core_dir = os.path.join(base, 'backend', 'app', 'shared_resources', 'core')
old_core_dir = os.path.join(base, 'core')

# 1. Restore files from backup
files_to_restore = [
    ("services_databricks_service.py", "services/databricks_service.py"),
    ("services_snowflake_service.py", "services/snowflake_service.py"),
    ("routes_lineage.py", "routes/lineage.py"),
    ("routes_metadata.py", "routes/metadata.py"),
    ("routes_rules.py", "routes/rules.py"),
    ("routes_analytics.py", "routes/analytics.py"),
    ("routes_ai_agent.py", "routes/ai_agent.py"),
    ("backend_main.py", "backend/main.py")
]

for backup_name, original_path in files_to_restore:
    src = os.path.join(backup_dir, backup_name)
    dst = os.path.join(base, original_path.replace('/', os.sep))
    if os.path.exists(src):
        shutil.copy(src, dst)

# 2. Move core dir back
if os.path.exists(new_core_dir):
    shutil.move(new_core_dir, old_core_dir)

print('Phase 6 rollback complete.')
