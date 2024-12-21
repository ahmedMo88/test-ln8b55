# External imports with versions
import pytest  # v7.4.0
import pytest_asyncio  # v0.21.0
import pytest_timeout  # v2.1.0
import pytest_benchmark  # v4.0.0
from typing import Dict, Any, List, Optional
import asyncio
import logging
import time
from datetime import datetime
import numpy as np

# Internal imports
from ...src.core.agent import Agent
from ...src.config.settings import Settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Test constants
TEST_TIMEOUT_SECONDS = 300
RELIABILITY_THRESHOLD = 0.999
PERFORMANCE_TARGETS = {
    'max_response_time': 5000,  # milliseconds
    'max_memory_usage': 512 * 1024 * 1024,  # 512MB
    'max_error_rate': 0.001
}

class MockMetricsCollector:
    """Mock metrics collector for test monitoring"""
    
    def __init__(self):
        """Initialize mock metrics collector"""
        self.metrics: Dict[str, Any] = {
            'request_count': 0,
            'error_count': 0,
            'total_latency': 0,
            'memory_usage': [],
            'success_rate': 1.0
        }
        self.events: List[Dict[str, Any]] = []
        
    def collect_metrics(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Collect test execution metrics
        
        Args:
            data: Metrics data to collect
            
        Returns:
            Dict[str, Any]: Collected metrics
        """
        self.metrics['request_count'] += 1
        self.metrics['total_latency'] += data.get('latency', 0)
        
        if data.get('error'):
            self.metrics['error_count'] += 1
            
        self.metrics['memory_usage'].append(data.get('memory', 0))
        self.metrics['success_rate'] = (
            self.metrics['request_count'] - self.metrics['error_count']
        ) / self.metrics['request_count']
        
        self.events.append({
            'timestamp': datetime.now().isoformat(),
            'event_type': data.get('event_type'),
            'details': data
        })
        
        return self.metrics

@pytest.fixture(scope='session')
async def setup_test_environment():
    """
    Set up comprehensive test environment with monitoring
    
    Returns:
        TestEnvironment: Configured test environment with metrics collection
    """
    # Initialize test settings
    settings = Settings(env_file=".env.test")
    
    # Configure test-specific settings
    settings.monitoring_config.update({
        'test_mode': True,
        'detailed_logging': True,
        'performance_monitoring': True
    })
    
    # Initialize agent with test configuration
    agent = Agent(settings)
    
    # Set up metrics collector
    metrics_collector = MockMetricsCollector()
    
    # Initialize test state
    test_env = {
        'agent': agent,
        'settings': settings,
        'metrics_collector': metrics_collector,
        'start_time': datetime.now()
    }
    
    logger.info("Test environment initialized successfully")
    return test_env

@pytest.mark.asyncio
@pytest.mark.timeout(TEST_TIMEOUT_SECONDS)
async def test_agent_reliability(setup_test_environment, benchmark):
    """
    Test agent reliability under various conditions
    
    Args:
        setup_test_environment: Test environment fixture
        benchmark: Pytest benchmark fixture
    """
    test_env = setup_test_environment
    agent = test_env['agent']
    metrics_collector = test_env['metrics_collector']
    
    # Test cases for different skills and scenarios
    test_cases = [
        {
            'request': "Summarize this text: The quick brown fox jumps over the lazy dog.",
            'skill': "TEXT_PROCESSING",
            'expected_contains': ["fox", "dog"]
        },
        {
            'request': "Should I proceed with the transaction if risk score is 0.8?",
            'skill': "DECISION_MAKING",
            'expected_contains': ["risk", "decision"]
        },
        {
            'request': "Analyze the trend in this data: [1,2,4,8,16]",
            'skill': "DATA_ANALYSIS",
            'expected_contains': ["exponential", "increase"]
        }
    ]
    
    # Test normal operation
    async def test_normal_operation():
        for test_case in test_cases:
            start_time = time.time()
            try:
                response = await agent.process_request(
                    request=test_case['request'],
                    context={'skill': test_case['skill']}
                )
                
                # Verify response contains expected terms
                response_text = str(response.get('results', [{}])[0].get('content', ''))
                assert all(term.lower() in response_text.lower() 
                          for term in test_case['expected_contains'])
                
                # Collect metrics
                metrics_collector.collect_metrics({
                    'event_type': 'request_processed',
                    'latency': (time.time() - start_time) * 1000,
                    'skill': test_case['skill'],
                    'success': True
                })
                
            except Exception as e:
                metrics_collector.collect_metrics({
                    'event_type': 'request_error',
                    'error': str(e),
                    'skill': test_case['skill']
                })
                raise
    
    # Test concurrent requests
    async def test_concurrent_requests():
        concurrent_requests = 10
        tasks = []
        for _ in range(concurrent_requests):
            for test_case in test_cases:
                tasks.append(agent.process_request(
                    request=test_case['request'],
                    context={'skill': test_case['skill']}
                ))
        
        start_time = time.time()
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        total_time = time.time() - start_time
        
        # Verify responses and collect metrics
        success_count = sum(1 for r in responses if not isinstance(r, Exception))
        metrics_collector.collect_metrics({
            'event_type': 'concurrent_requests',
            'total_requests': len(tasks),
            'success_rate': success_count / len(tasks),
            'avg_latency': total_time * 1000 / len(tasks)
        })
        
        assert success_count / len(tasks) >= RELIABILITY_THRESHOLD
    
    # Test error recovery
    async def test_error_recovery():
        # Simulate various error conditions
        error_cases = [
            {'request': '', 'expected_error': ValueError},
            {'request': 'x' * 1000000, 'expected_error': ValueError},
            {'request': None, 'expected_error': ValueError}
        ]
        
        for case in error_cases:
            try:
                await agent.process_request(request=case['request'])
                assert False, f"Expected {case['expected_error']} not raised"
            except case['expected_error']:
                metrics_collector.collect_metrics({
                    'event_type': 'expected_error',
                    'error_type': case['expected_error'].__name__,
                    'handled': True
                })
    
    # Execute reliability tests
    await test_normal_operation()
    await test_concurrent_requests()
    await test_error_recovery()
    
    # Verify overall reliability metrics
    final_metrics = metrics_collector.metrics
    assert final_metrics['success_rate'] >= RELIABILITY_THRESHOLD
    assert final_metrics['total_latency'] / final_metrics['request_count'] <= PERFORMANCE_TARGETS['max_response_time']
    
    # Run performance benchmark
    def benchmark_agent():
        asyncio.run(agent.process_request(
            request="Benchmark test request",
            context={'skill': 'TEXT_PROCESSING'}
        ))
    
    benchmark(benchmark_agent)
    
    logger.info("Reliability tests completed successfully", extra={
        'metrics': final_metrics,
        'duration': (datetime.now() - test_env['start_time']).total_seconds()
    })