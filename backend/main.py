import os
import sys

# Temporary path addition so backend/main.py can find root packages (db, routes, core, etc.) during refactoring
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables from the root .env file
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path=env_path)

# Import database, connection, and engines from the db package
from app.shared_resources.database import (
    get_db_connection,
    get_saved_credentials,
    get_platform_table,
    DATABASE_URL,
    DB_PATH,
    snowflake_engine,
    databricks_engine,
    snowflake_svc,
    databricks_svc,
    init_db,
    setup_app_state
)


app = FastAPI(
    title="Data Quality Control Plane API",
    description="Engine for pushing down data quality rules to Snowflake and Databricks.",
    version="1.0.0"
)

# Enable CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware to capture logged-in user context
@app.middleware("http")
async def add_current_user_to_context(request, call_next):
    from app.shared_resources.core.context import current_user_var
    username = request.headers.get("x-robin-user", "System")
    token = current_user_var.set(username)
    try:
        response = await call_next(request)
        return response
    finally:
        current_user_var.reset(token)

# Run database initialization and setup application state
init_db()
setup_app_state()

# Import and register routes from modules
from routes.auth import router as auth_router
from routes.metadata import router as metadata_router
from routes.rules import router as rules_router
from routes.lineage import router as lineage_router
from routes.analytics import router as analytics_router
from routes.ai_agent import router as ai_agent_router

app.include_router(auth_router)
app.include_router(metadata_router)
app.include_router(rules_router)
app.include_router(lineage_router)
app.include_router(analytics_router)
app.include_router(ai_agent_router)

@app.get("/health")
def health_check():
    return {"status": "healthy"}


