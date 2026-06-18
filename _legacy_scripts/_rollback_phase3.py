# ROLLBACK SCRIPT FOR PHASE 3
# Run this script from the Robin project root if you need to reverse Phase 3.
# Usage: python -c "exec(open('_legacy_scripts/_rollback_phase3.py').read())"

import shutil, os

base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
legacy = os.path.join(base, '_legacy_scripts')

files = [
  'patch.py','patch2.py','patch3.py','patch_cache.py','patch_datacatalog.py',
  'patch_dq_detail.py','patch_frontend.py','patch_glossary.py','patch_main.py',
  'patch_role_fix.py','patch_suggest.py','patch_table_detail.py',
  'test_api.py','test_connections.py','test_cte.py','test_dbx.py',
  'test_persistence.py','test_profile.py','test_real_usage.py',
  'test_sf.py','test_smtp.py','test_tables.py','test_usage.py'
]

for f in files:
  src = os.path.join(legacy, f)
  dst = os.path.join(base, f)
  if os.path.exists(src):
    shutil.move(src, dst)
    print(f'RESTORED: {f} -> root/')
  else:
    print(f'SKIP    : {f} not found in _legacy_scripts/')

print('Phase 3 rollback complete.')
