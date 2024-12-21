# External imports with versions
import pytest  # v7.4.0
from unittest.mock import MagicMock, patch, AsyncMock  # v3.11
import numpy as np  # v1.24.0
from typing import List, Dict, Any

# Internal imports
from ...src.core.embeddings import EmbeddingService
from ...src.config.settings import Settings

# Test constants
MOCK_EMBEDDING_DIMENSION = 1536
TEST_TEXT = "Sample text for embedding generation"
TEST_BATCH_SIZE = 100
TEST_TIMEOUT = 30

class TestEmbeddingService:
    """
    Comprehensive test suite for EmbeddingService with complete dependency isolation.
    """

    def setup_method(self):
        """Set up test fixtures and reset mocks before each test."""
        # Mock settings
        self._mock_settings = MagicMock(spec=Settings)
        self._mock_settings.get_vector_config.return_value = {
            'api_key': 'mock_pinecone_key',
            'environment': 'test',
            'index_name': 'test-index',
            'dimension': str(MOCK_EMBEDDING_DIMENSION)
        }
        self._mock_settings.get_openai_config.return_value = {
            'api_key': 'mock_openai_key',
            'org_id': 'mock_org_id',
            'model': 'text-embedding-ada-002'
        }

        # Mock OpenAI service
        self._mock_openai_service = AsyncMock()
        self._mock_openai_service.create_embedding.return_value = np.random.rand(MOCK_EMBEDDING_DIMENSION).tolist()

        # Mock Pinecone service
        self._mock_pinecone_service = MagicMock()
        self._mock_pinecone_service.upsert_vectors.return_value = True
        self._mock_pinecone_service.query.return_value = [
            {'id': 'test1', 'score': 0.9, 'metadata': {'text': 'test1'}},
            {'id': 'test2', 'score': 0.8, 'metadata': {'text': 'test2'}}
        ]
        self._mock_pinecone_service.delete_vectors.return_value = True

        # Mock logger
        self._mock_logger = MagicMock()

        # Initialize service with mocks
        with patch('src.core.embeddings.OpenAIService') as mock_openai_cls, \
             patch('src.core.embeddings.PineconeService') as mock_pinecone_cls, \
             patch('src.core.embeddings.logging.getLogger') as mock_logger:
            
            mock_openai_cls.return_value = self._mock_openai_service
            mock_pinecone_cls.return_value = self._mock_pinecone_service
            mock_logger.return_value = self._mock_logger
            
            self._embedding_service = EmbeddingService(self._mock_settings)

    @pytest.mark.asyncio
    async def test_generate_embedding(self):
        """Verify embedding generation with dimension validation."""
        # Test successful embedding generation
        embedding = await self._embedding_service.generate_embedding(TEST_TEXT)
        assert len(embedding) == MOCK_EMBEDDING_DIMENSION
        self._mock_openai_service.create_embedding.assert_called_once_with(TEST_TEXT)
        
        # Test empty input handling
        with pytest.raises(ValueError, match="Input text must be a non-empty string"):
            await self._embedding_service.generate_embedding("")
        
        # Test non-string input handling
        with pytest.raises(ValueError, match="Input text must be a non-empty string"):
            await self._embedding_service.generate_embedding(123)
        
        # Test dimension mismatch handling
        self._mock_openai_service.create_embedding.return_value = np.random.rand(100).tolist()
        with pytest.raises(ValueError, match="Generated embedding dimension .* does not match"):
            await self._embedding_service.generate_embedding(TEST_TEXT)

    @pytest.mark.asyncio
    async def test_store_embeddings(self):
        """Test vector storage operations with metadata."""
        # Prepare test data
        test_data = [
            ("id1", "text1", {"meta": "data1"}),
            ("id2", "text2", {"meta": "data2"})
        ]
        
        # Test successful storage
        success = await self._embedding_service.store_embeddings(test_data)
        assert success is True
        assert self._mock_pinecone_service.upsert_vectors.called
        
        # Test empty input handling
        with pytest.raises(ValueError, match="No text data provided for embedding storage"):
            await self._embedding_service.store_embeddings([])
        
        # Test batch processing
        large_test_data = [(f"id{i}", f"text{i}", {"meta": f"data{i}"}) 
                          for i in range(TEST_BATCH_SIZE + 50)]
        success = await self._embedding_service.store_embeddings(large_test_data)
        assert success is True
        assert self._mock_pinecone_service.upsert_vectors.call_count >= 2
        
        # Test storage failure handling
        self._mock_pinecone_service.upsert_vectors.return_value = False
        success = await self._embedding_service.store_embeddings(test_data)
        assert success is False

    @pytest.mark.asyncio
    async def test_search_similar(self):
        """Verify similarity search functionality."""
        # Test successful search
        results = await self._embedding_service.search_similar(TEST_TEXT)
        assert len(results) == 2
        assert all(isinstance(r, dict) for r in results)
        assert all('score' in r for r in results)
        
        # Test with custom top_k
        results = await self._embedding_service.search_similar(TEST_TEXT, top_k=1)
        self._mock_pinecone_service.query.assert_called_with(
            query_vector=self._mock_openai_service.create_embedding.return_value,
            top_k=1,
            filter_params=None
        )
        
        # Test with filters
        test_filter = {"category": "test"}
        await self._embedding_service.search_similar(TEST_TEXT, filter_params=test_filter)
        self._mock_pinecone_service.query.assert_called_with(
            query_vector=self._mock_openai_service.create_embedding.return_value,
            top_k=10,
            filter_params=test_filter
        )
        
        # Test empty query handling
        with pytest.raises(ValueError, match="Query text cannot be empty"):
            await self._embedding_service.search_similar("")
        
        # Test invalid top_k handling
        with pytest.raises(ValueError, match="top_k must be positive"):
            await self._embedding_service.search_similar(TEST_TEXT, top_k=0)

    def test_delete_embeddings(self):
        """Test embedding deletion operations."""
        # Test successful deletion
        test_ids = ["id1", "id2", "id3"]
        success = self._embedding_service.delete_embeddings(test_ids)
        assert success is True
        self._mock_pinecone_service.delete_vectors.assert_called_once_with(test_ids)
        
        # Test empty input handling
        with pytest.raises(ValueError, match="Invalid vector IDs provided"):
            self._embedding_service.delete_embeddings([])
        
        # Test invalid ID type handling
        with pytest.raises(ValueError, match="Invalid vector IDs provided"):
            self._embedding_service.delete_embeddings([1, 2, 3])
        
        # Test deletion failure handling
        self._mock_pinecone_service.delete_vectors.return_value = False
        success = self._embedding_service.delete_embeddings(test_ids)
        assert success is False

    @pytest.mark.asyncio
    async def test_error_handling(self):
        """Comprehensive error handling verification."""
        # Test OpenAI service failure
        self._mock_openai_service.create_embedding.side_effect = Exception("API Error")
        with pytest.raises(RuntimeError, match="Failed to generate embedding"):
            await self._embedding_service.generate_embedding(TEST_TEXT)
        
        # Test Pinecone service failure
        self._mock_pinecone_service.upsert_vectors.side_effect = Exception("Storage Error")
        with pytest.raises(RuntimeError, match="Failed to store embeddings"):
            await self._embedding_service.store_embeddings([("id1", "text1", {})])
        
        # Test connection error handling
        self._mock_pinecone_service.query.side_effect = ConnectionError("Connection failed")
        with pytest.raises(RuntimeError, match="Failed to execute similarity search"):
            await self._embedding_service.search_similar(TEST_TEXT)
        
        # Verify error logging
        assert self._mock_logger.error.called

@pytest.fixture(scope="session", autouse=True)
def pytest_configure():
    """Configure pytest environment for embedding tests."""
    # Set up test environment variables
    import os
    os.environ["OPENAI_API_KEY"] = "test_key"
    os.environ["PINECONE_API_KEY"] = "test_key"
    os.environ["PINECONE_ENVIRONMENT"] = "test"