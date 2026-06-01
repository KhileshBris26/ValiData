-- 1. Master Run History Table
CREATE TABLE IF NOT EXISTS DQ_RUN_HISTORY (
    run_id VARCHAR PRIMARY KEY,
    job_name VARCHAR,
    trigger_type VARCHAR, -- 'SCHEDULED', 'MANUAL'
    status VARCHAR,       -- 'RUNNING', 'SUCCESS', 'FAILED'
    start_time TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    end_time TIMESTAMP_NTZ,
    duration_ms NUMBER,
    total_rules NUMBER,
    failed_rules NUMBER,
    error_message VARCHAR
);

-- 2. Step-Level Logging Table
CREATE TABLE IF NOT EXISTS DQ_STEP_LOGS (
    log_id VARCHAR DEFAULT UUID_STRING() PRIMARY KEY,
    run_id VARCHAR,
    step_name VARCHAR,
    query_text VARCHAR,
    status VARCHAR,
    start_time TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    end_time TIMESTAMP_NTZ,
    rows_processed NUMBER,
    error_message VARCHAR,
    error_stack VARCHAR,
    query_id VARCHAR
);

-- 3. Master DQ Execution Stored Procedure
CREATE OR REPLACE PROCEDURE SP_RUN_DQ_JOB(JOB_NAME VARCHAR, TRIGGER_TYPE VARCHAR, TARGET_TABLE VARCHAR)
RETURNS VARCHAR
LANGUAGE JAVASCRIPT
EXECUTE AS CALLER
AS $$
    // Polyfill or simple UUID generator if not natively available in JS context
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    var run_id = generateUUID();
    
    // 1. Log Run Start
    var stmt = snowflake.createStatement({
        sqlText: `INSERT INTO DQ_RUN_HISTORY (run_id, job_name, trigger_type, status, start_time) 
                  VALUES (:1, :2, :3, 'RUNNING', CURRENT_TIMESTAMP())`,
        binds: [run_id, JOB_NAME, TRIGGER_TYPE]
    });
    stmt.execute();

    try {
        // Step 1: Fetch active rules for the target table
        // This is a simplified example. In production, this would read from the RULES_METADATA table.
        var step_name = "FETCH_RULES";
        snowflake.execute({sqlText: `INSERT INTO DQ_STEP_LOGS (run_id, step_name, query_text, status) VALUES ('${run_id}', '${step_name}', 'Fetch active rules for table ${TARGET_TABLE}', 'RUNNING')`});
        
        // Mock fetch success
        snowflake.execute({sqlText: `UPDATE DQ_STEP_LOGS SET status = 'SUCCESS', end_time = CURRENT_TIMESTAMP() WHERE run_id = '${run_id}' AND step_name = '${step_name}'`});


        // Step 2: Execute Null Check
        step_name = "EXECUTE_NULL_CHECK";
        // Assuming user passes TARGET_TABLE in format DB.SCHEMA.TABLE
        var rule_sql = `SELECT COUNT(*) FROM ${TARGET_TABLE} WHERE ID IS NULL;`; // Example rule
        
        // Log Step Start
        snowflake.execute({sqlText: `INSERT INTO DQ_STEP_LOGS (run_id, step_name, query_text, status) VALUES ('${run_id}', '${step_name}', '${rule_sql.replace(/'/g, "''")}', 'RUNNING')`});
        
        // Execute rule
        var res = snowflake.execute({sqlText: rule_sql});
        var query_id = res.getQueryId();
        
        // Log Step Success
        snowflake.execute({sqlText: `UPDATE DQ_STEP_LOGS SET status = 'SUCCESS', end_time = CURRENT_TIMESTAMP(), query_id = '${query_id}' WHERE run_id = '${run_id}' AND step_name = '${step_name}'`});
        
        
        // Finalize Run Success
        snowflake.execute({sqlText: `UPDATE DQ_RUN_HISTORY SET status = 'SUCCESS', end_time = CURRENT_TIMESTAMP() WHERE run_id = '${run_id}'`});
        
        return "SUCCESS: RUN_ID = " + run_id;
    } catch (err) {
        // Log Step Failure
        snowflake.execute({sqlText: `UPDATE DQ_STEP_LOGS SET status = 'FAILED', error_message = '${err.message.replace(/'/g, "''")}', end_time = CURRENT_TIMESTAMP() WHERE run_id = '${run_id}' AND status = 'RUNNING'`});
        
        // Log Run Failure
        snowflake.execute({sqlText: `UPDATE DQ_RUN_HISTORY SET status = 'FAILED', error_message = '${err.message.replace(/'/g, "''")}', end_time = CURRENT_TIMESTAMP() WHERE run_id = '${run_id}'`});
        
        return "FAILED: " + err.message;
    }
$$;

-- 4. Example Schedule Task Definition
-- Note: Replace with actual cron syntax and warehouse when deploying
-- CREATE OR REPLACE TASK DQ_SCHEDULE_TASK
--   WAREHOUSE = 'COMPUTE_WH'
--   SCHEDULE = 'USING CRON 0 0 * * * UTC'
--   AS CALL SP_RUN_DQ_JOB('DAILY_CATALOG_CHECK', 'SCHEDULED', 'MY_DB.MY_SCHEMA.MY_TABLE');

-- ALTER TASK DQ_SCHEDULE_TASK RESUME;
