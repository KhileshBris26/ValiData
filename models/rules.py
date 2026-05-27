from pydantic import BaseModel
from typing import Literal, Optional, Dict, Any

class RuleExecutionRequest(BaseModel):
    platform: Literal["snowflake", "databricks"]
    rule_type: Literal["NULL_CHECK", "BLANK_CHECK", "UNIQUE_CHECK", "RANGE_CHECK", "PATTERN_CHECK", "MIN_MAX_PROFILE"]
    table_name: str
    column_name: str
    rule_params: Optional[Dict[str, Any]] = None
    credentials: Optional[Dict[str, Any]] = None

class ProfileRequest(BaseModel):
    platform: Literal["snowflake", "databricks"]
    database_name: str
    schema_name: str
    table_name: str
    column_name: str
    credentials: Optional[Dict[str, Any]] = None

class AISuggestionRequest(BaseModel):
    platform: Literal["snowflake", "databricks"]
    table_name: str
    column_name: str
    credentials: Optional[Dict[str, Any]] = None

class MetadataRequest(BaseModel):
    platform: Literal["snowflake", "databricks"]
    entity_type: Literal["databases", "schemas", "tables", "columns"]
    database_name: Optional[str] = None
    schema_name: Optional[str] = None
    table_name: Optional[str] = None
    credentials: Optional[Dict[str, Any]] = None

class LineageRequest(BaseModel):
    platform: Literal["snowflake", "databricks"]
    database_name: str
    schema_name: str
    table_name: Optional[str] = None
    credentials: Optional[Dict[str, Any]] = None

class AnalyticsRequest(BaseModel):
    platform: Literal["snowflake", "databricks"]
    credentials: Optional[Dict[str, Any]] = None
    days_back: Optional[int] = 7
    database_name: Optional[str] = None

class CatalogRequest(BaseModel):
    platform: Literal["snowflake", "databricks"]
    credentials: Optional[Dict[str, Any]] = None

class TableSummaryRequest(BaseModel):
    platform: Literal["snowflake", "databricks"]
    table_name: str
    credentials: Optional[Dict[str, Any]] = None

class AIChatRequest(BaseModel):
    platform: Literal["snowflake", "databricks"]
    messages: list[Dict[str, str]]
    context_table: Optional[str] = None
    credentials: Optional[Dict[str, Any]] = None

class RuleSyncItem(BaseModel):
    platform: str
    database_name: str
    schema_name: str
    table_name: str
    column_name: str
    rule_type: str
    rule_params: Optional[Dict[str, Any]] = None
    status: Optional[str] = "Active"

class RuleSyncRequest(BaseModel):
    rules: list[RuleSyncItem]

class ExecutionLogItem(BaseModel):
    column_name: str
    rule_type: str
    total_rows: int
    failed_rows: int
    status: str

class ExecutionLogRequest(BaseModel):
    platform: str
    table_name: str
    executions: list[ExecutionLogItem]
    executed_by: Optional[str] = "User"

class ScheduleCreateUpdate(BaseModel):
    platform: str
    database_name: str
    schema_name: str
    table_name: str
    run_type: str
    frequency: str
    custom_config: Optional[Dict[str, Any]] = None
    start_time: str
    timezone: Optional[str] = "UTC"
    enabled: bool

class AnomalyResolveRequest(BaseModel):
    id: int


class InvalidRecord(BaseModel):
    column_name: str
    rule_type: str
    failed_rows: int
    status: str

class InvalidRecordsResponse(BaseModel):
    records: list[InvalidRecord]


class DashboardRequest(BaseModel):
    platform: str
    credentials: Optional[Dict[str, Any]] = None


