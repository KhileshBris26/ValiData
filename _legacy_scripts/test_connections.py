import os
from dotenv import load_dotenv
from connectors.snowflake_connector import SnowflakeConnector
from connectors.databricks_connector import DatabricksConnector

def main():
    print("Loading environment variables...")
    load_dotenv()
    
    print("\n--- Testing Snowflake Connection ---")
    if os.getenv("SNOWFLAKE_ACCOUNT") and os.getenv("SNOWFLAKE_ACCOUNT") != "your_org-your_account":
        try:
            sf = SnowflakeConnector()
            sf.connect()
            result = sf.execute_query("SELECT current_version(), current_role()")
            print(f"Snowflake Query Result: {result}")
            sf.disconnect()
        except Exception as e:
            print(f"Snowflake test failed: {e}")
    else:
        print("Skipping Snowflake test: Credentials not configured in .env")

    print("\n--- Testing Databricks Connection ---")
    if os.getenv("DATABRICKS_SERVER_HOSTNAME") and os.getenv("DATABRICKS_SERVER_HOSTNAME") != "your_workspace.cloud.databricks.com":
        try:
            db = DatabricksConnector()
            db.connect()
            result = db.execute_query("SELECT current_version(), current_user()")
            print(f"Databricks Query Result: {result}")
            db.disconnect()
        except Exception as e:
            print(f"Databricks test failed: {e}")
    else:
        print("Skipping Databricks test: Credentials not configured in .env")

if __name__ == "__main__":
    main()
