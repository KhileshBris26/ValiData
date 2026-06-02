from pydantic import BaseModel
from typing import List, Optional

class SaveMetadataRequest(BaseModel):
    platform: str
    database_name: str
    schema_name: str
    table_name: str
    column_name: Optional[str] = ""
    description: Optional[str] = ""
    terms: Optional[List[str]] = []
    is_auto_generated: Optional[bool] = False
    credentials: Optional[dict] = None

class FetchMetadataRequest(BaseModel):
    platform: str
    database_name: str
    schema_name: str
    table_name: str
    column_name: Optional[str] = ""
    credentials: Optional[dict] = None

class FetchAllMetadataRequest(BaseModel):
    platform: str
    database_name: str
    schema_name: str
    credentials: Optional[dict] = None
