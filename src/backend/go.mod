module github.com/workflow-automation/backend

go 1.21

require (
	github.com/gofiber/fiber/v2 v2.50.0 // High-performance HTTP server framework v2.50.0
	github.com/lib/pq v1.10.9 // PostgreSQL driver v1.10.9
	github.com/opentracing/opentracing-go v1.2.0 // Distributed tracing v1.2.0
	github.com/prometheus/client_golang v1.16.0 // Prometheus metrics client v1.16.0
	github.com/uber/jaeger-client-go v2.30.0+incompatible // Jaeger tracing client v2.30.0
	github.com/golang-jwt/jwt/v5 v5.0.0 // JWT authentication v5.0.0
	github.com/redis/go-redis/v9 v9.2.1 // Redis client v9.2.1
	github.com/spf13/viper v1.17.0 // Configuration management v1.17.0
	go.uber.org/zap v1.26.0 // Structured logging v1.26.0
	golang.org/x/sync v0.4.0 // Additional synchronization primitives v0.4.0
	google.golang.org/grpc v1.58.3 // gRPC framework v1.58.3
)

require (
	github.com/uber/jaeger-lib v2.4.1+incompatible // indirect
	go.uber.org/atomic v1.11.0 // indirect
	go.uber.org/multierr v1.11.0 // indirect
	golang.org/x/net v0.17.0 // indirect
	golang.org/x/sys v0.13.0 // indirect
	google.golang.org/protobuf v1.31.0 // indirect
)

// Replace directives if needed for local development
// replace github.com/workflow-automation/backend/pkg/common => ./pkg/common