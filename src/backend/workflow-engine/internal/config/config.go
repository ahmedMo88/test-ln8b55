// Package config provides configuration management for the workflow engine service
// with enhanced validation, security features, and monitoring capabilities.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Default configuration values
const (
	defaultDBHost          = "localhost"
	defaultDBPort         = 5432
	defaultDBName         = "workflow_engine"
	defaultDBMaxConns     = 25
	defaultDBIdleConns    = 5
	defaultEngineMaxExec  = 100
	defaultMaxRetries     = 3
	defaultMetricsPort    = 9090
)

// Default timeouts and intervals
var (
	defaultDBConnTimeout    = time.Second * 30
	defaultEngineTimeout    = time.Minute * 30
	defaultNodeTimeout     = time.Minute * 5
	defaultMetricsInterval = time.Second * 15
	defaultRetryBackoff    = time.Second * 5
	defaultHealthInterval  = time.Second * 30
)

// Config represents the main configuration structure for the workflow engine
type Config struct {
	Database   DatabaseConfig
	Engine     EngineConfig
	Monitoring MonitoringConfig
}

// DatabaseConfig contains database-related configuration with enhanced security
type DatabaseConfig struct {
	Host              string
	Port              int
	Name              string
	User              string
	Password          string
	MaxConnections    int
	IdleConnections   int
	ConnectionTimeout time.Duration
	HealthCheckInterval time.Duration
	EnableSSL         bool
	SSLMode           string
	EnableSharding    bool
	ShardCount        int
}

// EngineConfig contains workflow execution configuration
type EngineConfig struct {
	MaxConcurrentExecutions int
	ExecutionTimeout       time.Duration
	NodeTimeout           time.Duration
	EnableRetries         bool
	MaxRetries           int
	RetryBackoff         time.Duration
	EnableCircuitBreaker bool
	ErrorThreshold       float64
	BreakDuration       time.Duration
}

// MonitoringConfig contains monitoring and observability configuration
type MonitoringConfig struct {
	MetricsAddress       string
	EnableTracing        bool
	TracingEndpoint      string
	MetricsInterval      time.Duration
	EnableHealthChecks   bool
	HealthCheckEndpoint  string
	HealthCheckInterval  time.Duration
	EnableDetailedMetrics bool
}

// NewConfig creates a new configuration instance with validation
func NewConfig() (*Config, error) {
	cfg := &Config{
		Database:   loadDatabaseConfig(),
		Engine:     loadEngineConfig(),
		Monitoring: loadMonitoringConfig(),
	}

	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("configuration validation failed: %w", err)
	}

	return cfg, nil
}

// loadDatabaseConfig loads and validates database configuration
func loadDatabaseConfig() DatabaseConfig {
	return DatabaseConfig{
		Host:              getEnvOrDefault("DB_HOST", defaultDBHost),
		Port:              getEnvAsInt("DB_PORT", defaultDBPort, 1024, 65535),
		Name:              getEnvOrDefault("DB_NAME", defaultDBName),
		User:              getEnvOrDefault("DB_USER", ""),
		Password:          getEnvOrDefault("DB_PASSWORD", ""),
		MaxConnections:    getEnvAsInt("DB_MAX_CONNS", defaultDBMaxConns, 1, 1000),
		IdleConnections:   getEnvAsInt("DB_IDLE_CONNS", defaultDBIdleConns, 1, 100),
		ConnectionTimeout: getEnvAsDuration("DB_CONN_TIMEOUT", defaultDBConnTimeout, time.Second, time.Minute*5),
		HealthCheckInterval: getEnvAsDuration("DB_HEALTH_INTERVAL", defaultHealthInterval, time.Second*5, time.Minute*5),
		EnableSSL:         getEnvAsBool("DB_ENABLE_SSL", true),
		SSLMode:           getEnvOrDefault("DB_SSL_MODE", "verify-full"),
		EnableSharding:    getEnvAsBool("DB_ENABLE_SHARDING", false),
		ShardCount:        getEnvAsInt("DB_SHARD_COUNT", 1, 1, 100),
	}
}

// loadEngineConfig loads and validates engine configuration
func loadEngineConfig() EngineConfig {
	return EngineConfig{
		MaxConcurrentExecutions: getEnvAsInt("ENGINE_MAX_EXECUTIONS", defaultEngineMaxExec, 1, 1000),
		ExecutionTimeout:       getEnvAsDuration("ENGINE_EXECUTION_TIMEOUT", defaultEngineTimeout, time.Minute, time.Hour*24),
		NodeTimeout:           getEnvAsDuration("ENGINE_NODE_TIMEOUT", defaultNodeTimeout, time.Second*30, time.Hour),
		EnableRetries:         getEnvAsBool("ENGINE_ENABLE_RETRIES", true),
		MaxRetries:           getEnvAsInt("ENGINE_MAX_RETRIES", defaultMaxRetries, 0, 10),
		RetryBackoff:         getEnvAsDuration("ENGINE_RETRY_BACKOFF", defaultRetryBackoff, time.Second, time.Minute*5),
		EnableCircuitBreaker: getEnvAsBool("ENGINE_ENABLE_CIRCUIT_BREAKER", true),
		ErrorThreshold:       getEnvAsFloat("ENGINE_ERROR_THRESHOLD", 0.5, 0.0, 1.0),
		BreakDuration:       getEnvAsDuration("ENGINE_BREAK_DURATION", time.Minute, time.Second*30, time.Hour),
	}
}

// loadMonitoringConfig loads and validates monitoring configuration
func loadMonitoringConfig() MonitoringConfig {
	return MonitoringConfig{
		MetricsAddress:       fmt.Sprintf(":%d", getEnvAsInt("METRICS_PORT", defaultMetricsPort, 1024, 65535)),
		EnableTracing:        getEnvAsBool("ENABLE_TRACING", true),
		TracingEndpoint:      getEnvOrDefault("TRACING_ENDPOINT", "http://jaeger:14268/api/traces"),
		MetricsInterval:      getEnvAsDuration("METRICS_INTERVAL", defaultMetricsInterval, time.Second, time.Minute*5),
		EnableHealthChecks:   getEnvAsBool("ENABLE_HEALTH_CHECKS", true),
		HealthCheckEndpoint:  getEnvOrDefault("HEALTH_CHECK_ENDPOINT", "/health"),
		HealthCheckInterval: getEnvAsDuration("HEALTH_CHECK_INTERVAL", defaultHealthInterval, time.Second*5, time.Minute*5),
		EnableDetailedMetrics: getEnvAsBool("ENABLE_DETAILED_METRICS", true),
	}
}

// Validate performs comprehensive configuration validation
func (c *Config) Validate() error {
	if err := c.validateDatabase(); err != nil {
		return fmt.Errorf("database configuration error: %w", err)
	}

	if err := c.validateEngine(); err != nil {
		return fmt.Errorf("engine configuration error: %w", err)
	}

	if err := c.validateMonitoring(); err != nil {
		return fmt.Errorf("monitoring configuration error: %w", err)
	}

	return c.validateCrossConfig()
}

// validateDatabase validates database configuration
func (c *Config) validateDatabase() error {
	if c.Database.User == "" || c.Database.Password == "" {
		return fmt.Errorf("database credentials are required")
	}

	if c.Database.EnableSharding && c.Database.ShardCount < 2 {
		return fmt.Errorf("shard count must be at least 2 when sharding is enabled")
	}

	if c.Database.MaxConnections < c.Database.IdleConnections {
		return fmt.Errorf("max connections must be greater than idle connections")
	}

	return nil
}

// validateEngine validates engine configuration
func (c *Config) validateEngine() error {
	if c.Engine.EnableRetries && c.Engine.MaxRetries < 1 {
		return fmt.Errorf("max retries must be positive when retries are enabled")
	}

	if c.Engine.EnableCircuitBreaker && (c.Engine.ErrorThreshold <= 0 || c.Engine.ErrorThreshold >= 1) {
		return fmt.Errorf("error threshold must be between 0 and 1")
	}

	return nil
}

// validateMonitoring validates monitoring configuration
func (c *Config) validateMonitoring() error {
	if c.Monitoring.EnableTracing && c.Monitoring.TracingEndpoint == "" {
		return fmt.Errorf("tracing endpoint is required when tracing is enabled")
	}

	return nil
}

// validateCrossConfig performs cross-configuration validation
func (c *Config) validateCrossConfig() error {
	if c.Engine.NodeTimeout >= c.Engine.ExecutionTimeout {
		return fmt.Errorf("node timeout must be less than execution timeout")
	}

	return nil
}

// Helper functions for environment variable processing

func getEnvOrDefault(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue, minValue, maxValue int) int {
	strValue, exists := os.LookupEnv(key)
	if !exists {
		return defaultValue
	}

	value, err := strconv.Atoi(strValue)
	if err != nil {
		return defaultValue
	}

	if value < minValue || value > maxValue {
		return defaultValue
	}

	return value
}

func getEnvAsDuration(key string, defaultValue, minValue, maxValue time.Duration) time.Duration {
	strValue, exists := os.LookupEnv(key)
	if !exists {
		return defaultValue
	}

	value, err := time.ParseDuration(strValue)
	if err != nil {
		return defaultValue
	}

	if value < minValue || value > maxValue {
		return defaultValue
	}

	return value
}

func getEnvAsBool(key string, defaultValue bool) bool {
	strValue, exists := os.LookupEnv(key)
	if !exists {
		return defaultValue
	}

	value, err := strconv.ParseBool(strValue)
	if err != nil {
		return defaultValue
	}

	return value
}

func getEnvAsFloat(key string, defaultValue, minValue, maxValue float64) float64 {
	strValue, exists := os.LookupEnv(key)
	if !exists {
		return defaultValue
	}

	value, err := strconv.ParseFloat(strValue, 64)
	if err != nil {
		return defaultValue
	}

	if value < minValue || value > maxValue {
		return defaultValue
	}

	return value
}