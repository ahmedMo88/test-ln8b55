# External imports with versions
import pinecone  # v2.2.4
from tenacity import retry, wait_exponential  # v8.2.3
from typing import List, Dict, Tuple, Optional  # v3.11
import logging  # v3.11

# Internal imports
from ..config.settings import Settings

# Configure logging
LOGGER = logging.getLogger(__name__)

# Retry configuration constants
RETRY_MULTIPLIER = 1  # Base delay multiplier
MIN_RETRY_WAIT = 4   # Minimum retry wait time in seconds
MAX_RETRY_WAIT = 60  # Maximum retry wait time in seconds

class PineconeService:
    """
    Service class for managing vector operations in Pinecone database with enhanced 
    reliability and monitoring features.
    """

    def __init__(self, settings: Settings):
        """
        Initialize Pinecone service with configuration settings and establish connection.

        Args:
            settings (Settings): Application settings instance containing Pinecone configuration
        
        Raises:
            ConnectionError: If unable to establish connection with Pinecone
            ValueError: If configuration is invalid
        """
        try:
            # Get vector database configuration
            vector_config = settings.get_vector_config()
            
            # Initialize Pinecone client
            pinecone.init(
                api_key=vector_config['api_key'],
                environment=vector_config['environment']
            )
            
            # Store configuration for validation
            self._index_name = vector_config['index_name']
            self._dimension = int(vector_config['dimension'])
            
            # Connect to index with validation
            if self._index_name not in pinecone.list_indexes():
                raise ValueError(f"Index {self._index_name} not found in Pinecone")
            
            self._index = pinecone.Index(self._index_name)
            
            LOGGER.info(f"Successfully connected to Pinecone index: {self._index_name}")
            
        except Exception as e:
            LOGGER.error(f"Failed to initialize Pinecone service: {str(e)}")
            raise ConnectionError(f"Pinecone initialization failed: {str(e)}")

    @retry(wait=wait_exponential(multiplier=RETRY_MULTIPLIER, min=MIN_RETRY_WAIT, max=MAX_RETRY_WAIT))
    def upsert_vectors(self, vector_data: List[Tuple[str, List[float], Dict]]) -> bool:
        """
        Insert or update vectors in the database with retry mechanism.

        Args:
            vector_data (List[Tuple[str, List[float], Dict]]): List of tuples containing
                (id, vector, metadata) for each vector to upsert

        Returns:
            bool: Success status of upsert operation

        Raises:
            ValueError: If vector dimensions don't match index configuration
            RuntimeError: If upsert operation fails after retries
        """
        try:
            # Validate vector dimensions
            for _, vector, _ in vector_data:
                if len(vector) != self._dimension:
                    raise ValueError(
                        f"Vector dimension {len(vector)} does not match index dimension {self._dimension}"
                    )

            # Format vectors for batch upsert
            vectors = [(id, vec, meta) for id, vec, meta in vector_data]
            
            # Execute upsert with performance logging
            LOGGER.info(f"Upserting {len(vectors)} vectors to index {self._index_name}")
            self._index.upsert(vectors=vectors)
            
            LOGGER.info(f"Successfully upserted {len(vectors)} vectors")
            return True

        except Exception as e:
            LOGGER.error(f"Vector upsert failed: {str(e)}")
            raise RuntimeError(f"Failed to upsert vectors: {str(e)}")

    @retry(wait=wait_exponential(multiplier=RETRY_MULTIPLIER, min=MIN_RETRY_WAIT, max=MAX_RETRY_WAIT))
    def query(self, query_vector: List[float], top_k: int = 10, 
             filter_params: Optional[Dict] = None) -> List[Dict]:
        """
        Search for similar vectors with configurable parameters.

        Args:
            query_vector (List[float]): Vector to search for
            top_k (int): Number of similar vectors to return
            filter_params (Optional[Dict]): Metadata filters for the query

        Returns:
            List[Dict]: Similar vectors with scores and metadata

        Raises:
            ValueError: If query vector dimension is invalid
            RuntimeError: If query operation fails after retries
        """
        try:
            # Validate query vector dimension
            if len(query_vector) != self._dimension:
                raise ValueError(
                    f"Query vector dimension {len(query_vector)} does not match index dimension {self._dimension}"
                )

            # Execute query with monitoring
            LOGGER.info(f"Querying index {self._index_name} for top {top_k} matches")
            results = self._index.query(
                vector=query_vector,
                top_k=top_k,
                include_metadata=True,
                filter=filter_params
            )

            # Process and format results
            matches = [
                {
                    'id': match.id,
                    'score': match.score,
                    'metadata': match.metadata
                }
                for match in results.matches
            ]

            LOGGER.info(f"Successfully retrieved {len(matches)} matches")
            return matches

        except Exception as e:
            LOGGER.error(f"Vector query failed: {str(e)}")
            raise RuntimeError(f"Failed to query vectors: {str(e)}")

    @retry(wait=wait_exponential(multiplier=RETRY_MULTIPLIER, min=MIN_RETRY_WAIT, max=MAX_RETRY_WAIT))
    def delete_vectors(self, vector_ids: List[str]) -> bool:
        """
        Delete vectors from the database with validation.

        Args:
            vector_ids (List[str]): List of vector IDs to delete

        Returns:
            bool: Success status of deletion

        Raises:
            ValueError: If vector_ids is empty or invalid
            RuntimeError: If deletion operation fails after retries
        """
        try:
            # Validate input
            if not vector_ids:
                raise ValueError("No vector IDs provided for deletion")

            # Execute deletion with logging
            LOGGER.info(f"Deleting {len(vector_ids)} vectors from index {self._index_name}")
            self._index.delete(ids=vector_ids)

            LOGGER.info(f"Successfully deleted {len(vector_ids)} vectors")
            return True

        except Exception as e:
            LOGGER.error(f"Vector deletion failed: {str(e)}")
            raise RuntimeError(f"Failed to delete vectors: {str(e)}")

    def get_index_stats(self) -> Dict:
        """
        Retrieve comprehensive statistics about the Pinecone index.

        Returns:
            Dict: Detailed index statistics including vector count, dimension, and index status

        Raises:
            RuntimeError: If unable to retrieve index statistics
        """
        try:
            # Fetch index statistics
            stats = self._index.describe_index_stats()
            
            # Format and enhance statistics
            enhanced_stats = {
                'index_name': self._index_name,
                'dimension': self._dimension,
                'total_vector_count': stats.total_vector_count,
                'namespaces': stats.namespaces,
                'index_fullness': stats.total_vector_count / stats.dimension,
                'status': 'healthy' if self._index else 'unhealthy'
            }

            LOGGER.info(f"Retrieved index statistics for {self._index_name}")
            return enhanced_stats

        except Exception as e:
            LOGGER.error(f"Failed to retrieve index statistics: {str(e)}")
            raise RuntimeError(f"Failed to get index statistics: {str(e)}")