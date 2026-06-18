# Forwarding script for backward compatibility during refactoring
import sys
import os

# Add the backend directory to sys.path
backend_path = os.path.join(os.path.dirname(__file__), 'backend')
sys.path.insert(0, backend_path)

# Forward the FastAPI app instance from backend/main.py
from backend.main import app

if __name__ == "__main__":
    import uvicorn
    # This allows developers to still run `python main.py` at the root
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
