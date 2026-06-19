import shutil, os
base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
legacy = os.path.join(base, '_legacy_scripts')

shutil.copy(os.path.join(legacy, 'main_phase3.py.bak'), os.path.join(base, 'main.py'))
shutil.copy(os.path.join(legacy, 'requirements_phase3.txt.bak'), os.path.join(base, 'requirements.txt'))

for f in ['main.py', 'requirements.txt']:
    path = os.path.join(base, 'backend', f)
    if os.path.exists(path):
        os.remove(path)
print('Phase 4 rollback complete.')
