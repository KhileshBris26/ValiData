import shutil, os

base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
legacy = os.path.join(base, '_legacy_scripts')
backup_dir = os.path.join(legacy, 'phase5_backups')
db_dir = os.path.join(base, 'db')
new_db_dir = os.path.join(base, 'backend', 'app', 'shared_resources', 'database')

# Ensure db directory exists
if not os.path.exists(db_dir):
    os.makedirs(db_dir)

# 1. Restore files from backup
files_to_restore = [
    ("routes_rules.py", "routes/rules.py"),
    ("routes_metadata.py", "routes/metadata.py"),
    ("routes_lineage.py", "routes/lineage.py"),
    ("routes_auth.py", "routes/auth.py"),
    ("routes_analytics.py", "routes/analytics.py"),
    ("routes_ai_agent.py", "routes/ai_agent.py"),
    ("backend_main.py", "backend/main.py")
]

for backup_name, original_path in files_to_restore:
    src = os.path.join(backup_dir, backup_name)
    dst = os.path.join(base, original_path.replace('/', os.sep))
    if os.path.exists(src):
        shutil.copy(src, dst)

# 2. Restore db files and their contents
db_files = [
    ("db_init.py", "init.py"),
    ("db___init__.py", "__init__.py")
]

for backup_name, original_name in db_files:
    src = os.path.join(backup_dir, backup_name)
    dst = os.path.join(db_dir, original_name)
    if os.path.exists(src):
        shutil.copy(src, dst)

# Move connection.py back (it wasn't modified directly before move, so move is fine)
connection_src = os.path.join(new_db_dir, 'connection.py')
connection_dst = os.path.join(db_dir, 'connection.py')
if os.path.exists(connection_src):
    shutil.move(connection_src, connection_dst)

# Clean up new db dir files
for f in ['init.py', '__init__.py']:
    path = os.path.join(new_db_dir, f)
    if os.path.exists(path):
        os.remove(path)

print('Phase 5 rollback complete.')
