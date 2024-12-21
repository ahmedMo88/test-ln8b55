# External imports with versions
import numpy as np  # v1.24.0
from tenacity import retry, wait_exponential  # v8.2.3
from typing import List, Dict, Tuple, Optional  # v3.11
import logging  # v3.11

# Internal imports
from ..config.settings import Settings
from ..services.openai import OpenAIService
from ..services.pinecone import PineconeService

# Configure logging
LOGGER = logging.getLogger(__name__)

# Constants for batch processing and retry configuration
BATCH_SIZE = 100
RETRY_MULTIPLIER = 1
MIN_RETRY_WAIT = 4
MAX_RETRY_WAIT = 60

class EmbeddingService:
    """
    Enterprise-grade service for managing text embeddings and vector operations with
    enhanced reliability, batch processing, and comprehensive error handling.
    """

    def __init__(self, settings: Settings):
        """
        Initialize embedding service with required dependencies and configuration.

        Args:
            settings (Settings): Application settings instance

        Raises:
            ConnectionError: If unable to initialize required services
            ValueError: If configuration is invalid
        """
        try:
            self._settings = settings
            self._openai_service = OpenAIService(settings)
            self._pinecone_service = PineconeService(settings)
            
            # Get vector configuration
            vector_config = settings.get_vector_config()
            self._embedding_dimension = int(vector_config['dimension'])

            LOGGER.info(
                "Embedding service initialized successfully",
                extra={
                    "embedding_dimension": self._embedding_dimension,
                    "batch_size": BATCH_SIZE
                }
            )

        except Exception as e:
            LOGGER.error(f"Failed to initialize embedding service: {str(e)}")
            raise ConnectionError(f"Embedding service initialization failed: {str(e)}")

    @retry(wait=wait_exponential(multiplier=RETRY_MULTIPLIER, min=MIN_RETRY_WAIT, max=MAX_RETRY_WAIT))
    async def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding vector for input text with enhanced error handling and validation.

        Args:
            text (str): Input text for embedding generation

        Returns:
            List[float]: Generated embedding vector

        Raises:
            ValueError: If input text is invalid
            RuntimeError: If embedding generation fails
        """
        try:
            # Validate input text
            if not text or not isinstance(text, str):
                raise ValueError("Input text must be a non-empty string")

            LOGGER.info("Generating embedding for text", extra={"text_length": len(text)})

            # Generate embedding using OpenAI service
            embedding = await self._openai_service.create_embedding(text)

            # Validate embedding dimension
            if len(embedding) != self._embedding_dimension:
                raise ValueError(
                    f"Generated embedding dimension {len(embedding)} does not match "
                    f"expected dimension {self._embedding_dimension}"
                )

            LOGGER.info("Successfully generated embedding vector")
            return embedding

        except Exception as e:
            LOGGER.error(f"Embedding generation failed: {str(e)}")
            raise RuntimeError(f"Failed to generate embedding: {str(e)}")

    async def store_embeddings(self, text_data: List[Tuple[str, str, Dict]]) -> bool:
        """
        Store embeddings with metadata in vector database using efficient batch processing.

        Args:
            text_data (List[Tuple[str, str, Dict]]): List of tuples containing
                (id, text, metadata) for each item to store

        Returns:
            bool: Success status of storage operation

        Raises:
            ValueError: If input data is invalid
            RuntimeError: If storage operation fails
        """
        try:
            # Validate input data
            if not text_data:
                raise ValueError("No text data provided for embedding storage")

            LOGGER.info(f"Processing {len(text_data)} items for embedding storage")

            # Process in batches for efficiency
            success = True
            for i in range(0, len(text_data), BATCH_SIZE):
                batch = text_data[i:i + BATCH_SIZE]
                
                # Generate embeddings for batch
                vector_data = []
                for id_, text, metadata in batch:
                    embedding = await self.generate_embedding(text)
                    vector_data.append((id_, embedding, metadata))

                # Store batch in vector database
                batch_success = self._pinecone_service.upsert_vectors(vector_data)
                success = success and batch_success

                LOGGER.info(f"Processed batch {i//BATCH_SIZE + 1}", 
                          extra={"batch_size": len(batch), "success": batch_success})

            return success

        except Exception as e:
            LOGGER.error(f"Embedding storage failed: {str(e)}")
            raise RuntimeError(f"Failed to store embeddings: {str(e)}")

    async def search_similar(
        self, 
        query_text: str, 
        top_k: int = 10, 
        filter_params: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Search for similar vectors using text query with enhanced filtering and validation.

        Args:
            query_text (str): Text to search for
            top_k (int): Number of similar items to return
            filter_params (Optional[Dict]): Metadata filters for the query

        Returns:
            List[Dict]: Similar items with scores and metadata

        Raises:
            ValueError: If query parameters are invalid
            RuntimeError: If search operation fails
        """
        try:
            # Validate input parameters
            if not query_text:
                raise ValueError("Query text cannot be empty")
            if top_k < 1:
                raise ValueError("top_k must be positive")

            # Generate embedding for query text
            query_embedding = await self.generate_embedding(query_text)

            # Execute similarity search
            results = self._pinecone_service.query(
                query_vector=query_embedding,
                top_k=top_k,
                filter_params=filter_params
            )

            LOGGER.info(
                "Similarity search completed",
                extra={
                    "query_length": len(query_text),
                    "results_count": len(results),
                    "top_k": top_k
                }
            )

            return results

        except Exception as e:
            LOGGER.error(f"Similarity search failed: {str(e)}")
            raise RuntimeError(f"Failed to execute similarity search: {str(e)}")

    def delete_embeddings(self, vector_ids: List[str]) -> bool:
        """
        Delete embeddings from vector database with validation and logging.

        Args:
            vector_ids (List[str]): List of vector IDs to delete

        Returns:
            bool: Success status of deletion operation

        Raises:
            ValueError: If vector IDs are invalid
            RuntimeError: If deletion operation fails
        """
        try:
            # Validate vector IDs
            if not vector_ids or not all(isinstance(id_, str) for id_ in vector_ids):
                raise ValueError("Invalid vector IDs provided")

            LOGGER.info(f"Deleting {len(vector_ids)} vectors")

            # Execute deletion
            success = self._pinecone_service.delete_vectors(vector_ids)

            LOGGER.info(
                "Vector deletion completed",
                extra={
                    "vectors_deleted": len(vector_ids),
                    "success": success
                }
            )

            return success

        except Exception as e:
            LOGGER.error(f"Vector deletion failed: {str(e)}")
            raise RuntimeError(f"Failed to delete vectors: {str(e)}")