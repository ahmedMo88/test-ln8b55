// Package main provides the entry point for the workflow engine service
package main

import (
    "context"
    "fmt"
    "os"
    "os/signal"
    "syscall"
    "time"

    "github.com/gofiber/fiber/v2"                 // v2.50.0
    "github.com/gofiber/fiber/v2/middleware/cors" // v2.50.0
    "github.com/gofiber/fiber/v2/middleware/logger" // v2.50.0
    "github.com/gofiber/fiber/v2/middleware/recover" // v2.50.0
    "github.com/gofiber/fiber/v2/middleware/monitor" // v2.50.0
    "github.com/prometheus/client_golang/prometheus" // v1.16.0
    "github.com/uber/jaeger-client-go"             // v2.30.0
    "github.com/uber/jaeger-client-go/config"      // v2.30.0
    "go.uber.org/zap"                              // v1.26.0
    "github.com/sony/gobreaker"                    // v2.5.0

    "workflow-engine/internal/config"
    "workflow-engine/internal/core"
    "workflow-engine/internal/handlers"
)

// Global variables for observability
var (
    logger *zap.Logger
    metrics *prometheus.Registry
    tracer opentracing.Tracer
)

func main() {
    // Initialize structured logger
    logger, err := initLogger()
    if err != nil {
        fmt.Printf("Failed to initialize logger: %v\n", err)
        os.Exit(1)
    }
    defer logger.Sync()

    // Load configuration
    cfg, err := config.NewConfig()
    if err != nil {
        logger.Fatal("Failed to load configuration", zap.Error(err))
    }

    // Initialize tracing
    tracer, closer, err := initTracing(cfg)
    if err != nil {
        logger.Fatal("Failed to initialize tracing", zap.Error(err))
    }
    defer closer.Close()

    // Initialize metrics registry
    metrics = prometheus.NewRegistry()
    metrics.MustRegister(prometheus.NewGoCollector())
    metrics.MustRegister(prometheus.NewProcessCollector(prometheus.ProcessCollectorOpts{}))

    // Initialize workflow engine
    engine, err := initEngine(cfg)
    if err != nil {
        logger.Fatal("Failed to initialize workflow engine", zap.Error(err))
    }

    // Create Fiber app with configuration
    app := fiber.New(fiber.Config{
        ReadTimeout:  time.Second * 30,
        WriteTimeout: time.Second * 30,
        IdleTimeout:  time.Second * 60,
        BodyLimit:    1024 * 1024, // 1MB
        ErrorHandler: customErrorHandler,
    })

    // Setup middleware stack
    setupMiddleware(app, cfg)

    // Initialize handlers
    workflowHandler := handlers.NewWorkflowHandler(engine, tracer)

    // Setup routes
    setupRoutes(app, workflowHandler)

    // Start server
    go func() {
        logger.Info("Starting server", zap.String("address", cfg.Server.Address))
        if err := app.Listen(cfg.Server.Address); err != nil {
            logger.Fatal("Server failed", zap.Error(err))
        }
    }()

    // Graceful shutdown
    gracefulShutdown(app, engine)
}

// initLogger initializes the structured logger with rotation
func initLogger() (*zap.Logger, error) {
    config := zap.NewProductionConfig()
    config.OutputPaths = []string{"stdout", "/var/log/workflow-engine.log"}
    config.ErrorOutputPaths = []string{"stderr", "/var/log/workflow-engine-error.log"}
    
    return config.Build()
}

// initTracing initializes the distributed tracing system
func initTracing(cfg *config.Config) (opentracing.Tracer, io.Closer, error) {
    jaegerCfg := &config.Configuration{
        ServiceName: "workflow-engine",
        Sampler: &config.SamplerConfig{
            Type:  jaeger.AdaptiveSampler,
            Param: 1,
        },
        Reporter: &config.ReporterConfig{
            LogSpans:            true,
            LocalAgentHostPort: cfg.Monitoring.TracingEndpoint,
        },
    }

    return jaegerCfg.NewTracer()
}

// setupMiddleware configures the middleware stack
func setupMiddleware(app *fiber.App, cfg *config.Config) {
    // Recovery middleware
    app.Use(recover.New(recover.Config{
        EnableStackTrace: true,
        StackTraceHandler: func(e interface{}) {
            logger.Error("Panic recovered", zap.Any("error", e))
        },
    }))

    // CORS middleware
    app.Use(cors.New(cors.Config{
        AllowOrigins:     cfg.Server.CorsOrigins,
        AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
        AllowHeaders:     "Origin,Content-Type,Accept,Authorization",
        ExposeHeaders:    "Content-Length",
        AllowCredentials: true,
        MaxAge:           3600,
    }))

    // Request logging
    app.Use(logger.New(logger.Config{
        Format:     "${time} ${status} ${method} ${path} ${latency}\n",
        TimeFormat: "2006-01-02 15:04:05",
        Output:     os.Stdout,
    }))

    // Tracing middleware
    app.Use(func(c *fiber.Ctx) error {
        span := tracer.StartSpan(c.Path())
        defer span.Finish()
        
        c.Locals("span", span)
        return c.Next()
    })

    // Metrics middleware
    app.Use(func(c *fiber.Ctx) error {
        start := time.Now()
        err := c.Next()
        duration := time.Since(start).Seconds()
        
        httpRequestDuration.WithLabelValues(
            c.Method(),
            c.Path(),
            fmt.Sprintf("%d", c.Response().StatusCode()),
        ).Observe(duration)
        
        return err
    })
}

// setupRoutes configures API routes
func setupRoutes(app *fiber.App, handler *handlers.WorkflowHandler) {
    // Health check endpoint
    app.Get("/health", func(c *fiber.Ctx) error {
        return c.JSON(fiber.Map{
            "status": "healthy",
            "time":   time.Now().UTC(),
        })
    })

    // Metrics endpoint
    app.Get("/metrics", monitor.New())

    // API v1 routes
    v1 := app.Group("/api/v1")
    
    workflows := v1.Group("/workflows")
    workflows.Post("/", handler.CreateWorkflow)
    workflows.Get("/:id", handler.GetWorkflow)
    workflows.Put("/:id", handler.UpdateWorkflow)
    workflows.Delete("/:id", handler.DeleteWorkflow)
    workflows.Post("/:id/execute", handler.ExecuteWorkflow)
    workflows.Get("/:id/status", handler.GetWorkflowStatus)
}

// gracefulShutdown handles graceful shutdown process
func gracefulShutdown(app *fiber.App, engine *core.Engine) {
    sigChan := make(chan os.Signal, 1)
    signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

    <-sigChan
    logger.Info("Shutting down server...")

    // Create shutdown context with timeout
    ctx, cancel := context.WithTimeout(context.Background(), time.Second*30)
    defer cancel()

    // Stop accepting new requests
    if err := app.ShutdownWithContext(ctx); err != nil {
        logger.Error("Server shutdown failed", zap.Error(err))
    }

    // Stop workflow engine
    if err := engine.Stop(); err != nil {
        logger.Error("Engine shutdown failed", zap.Error(err))
    }

    // Flush tracing
    if closer, ok := tracer.(io.Closer); ok {
        if err := closer.Close(); err != nil {
            logger.Error("Failed to close tracer", zap.Error(err))
        }
    }

    logger.Info("Server shutdown complete")
    os.Exit(0)
}

// customErrorHandler provides custom error handling
func customErrorHandler(c *fiber.Ctx, err error) error {
    code := fiber.StatusInternalServerError
    message := "Internal Server Error"

    if e, ok := err.(*fiber.Error); ok {
        code = e.Code
        message = e.Message
    }

    logger.Error("Request error",
        zap.Int("status", code),
        zap.String("path", c.Path()),
        zap.Error(err),
    )

    return c.Status(code).JSON(fiber.Map{
        "error":   message,
        "status":  code,
        "path":    c.Path(),
        "request_id": c.Get("X-Request-ID"),
    })
}