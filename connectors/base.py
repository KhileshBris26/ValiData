from abc import ABC, abstractmethod
from typing import Any, List, Dict

class BaseConnector(ABC):
    """Abstract base class for all data warehouse connectors."""
    
    @abstractmethod
    def connect(self) -> None:
        """Establish a connection to the data warehouse."""
        pass

    @abstractmethod
    def execute_query(self, query: str) -> List[Dict[str, Any]]:
        """
        Execute a SQL query and return the results as a list of dictionaries.
        
        Args:
            query (str): The native SQL query to execute.
            
        Returns:
            List[Dict[str, Any]]: The result set where each row is a dictionary mapping column names to values.
        """
        pass

    @abstractmethod
    def disconnect(self) -> None:
        """Close the connection to the data warehouse."""
        pass
