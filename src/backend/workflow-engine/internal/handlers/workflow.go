// Package handlers provides HTTP request handlers for the workflow engine
package handlers

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "time"

    "github.com/gofiber/fiber/v2" // v2.50.0
    "github.com/gofiber/fiber/v2/middleware/cache" // v2.50.0
    "github.com/gofiber/fiber/v2/middleware/ratelimit" // v2.50.0
    "github.com/go-playground/validator/v10" // v10.15.5
    "github.com/google/uuid" // v1.3.0
    "github.com/opentracing/opentracing-go" // v1.2.0
    "github.com/opentracing/opentracing-go/ext"

    "workflow-engine/internal/models"
    "workflow-engine/internal/services"
)

// Request validation constants
const (
    maxNameLength     = 100
    maxDescLength     = 500
    defaultTimeout    = 5 * time.Second
    maxRequestSize    = 1 << 20 // 1MB
    rateLimit        = 100      // requests per minute
    cacheDuration    = 5 * time.Minute
)

// Error definitions
var (
    ErrInvalidRequest = fiber.NewError(http.StatusBadRequest, "invalid request")
    ErrUnauthorized   = fiber.NewError(http.StatusUnauthorized, "unauthorized")
    ErrNotFound      = fiber.NewError(http.StatusNotFound, "workflow not found")
    ErrTimeout       = fiber.NewError(http.StatusGatewayTimeout, "request timeout")
)

// CreateWorkflowRequest represents the workflow creation payload
type CreateWorkflowRequest struct {
    Name        string                 `json:"name" validate:"required,min=1,max=100"`
    Description string                 `json:"description" validate:"max=500"`
    Nodes       []*models.Node         `json:"nodes" validate:"dive"`
    Metadata    map[string]interface{} `json:"metadata" validate:"omitempty"`
}

// WorkflowHandler handles HTTP requests for workflow operations
type WorkflowHandler struct {
    service     *services.WorkflowService
    validator   *validator.Validate
    tracer      opentracing.Tracer
    cache       *cache.Config
    rateLimiter *ratelimit.Config
}

// NewWorkflowHandler creates a new workflow handler instance
func NewWorkflowHandler(service *services.WorkflowService, tracer opentracing.Tracer) *WorkflowHandler {
    // Initialize rate limiter
    rateLimiter := &ratelimit.Config{
        Max:        rateLimit,
        Expiration: time.Minute,
        KeyGenerator: func(c *fiber.Ctx) string {
            return c.Get("X-API-Key", c.IP()) // Use API key or IP for rate limiting
        },
    }

    // Initialize cache
    cache := &cache.Config{
        Expiration:   cacheDuration,
        CacheControl: true,
    }

    return &WorkflowHandler{
        service:     service,
        validator:   validator.New(),
        tracer:      tracer,
        cache:       cache,
        rateLimiter: rateLimiter,
    }
}

// CreateWorkflow handles workflow creation requests
func (h *WorkflowHandler) CreateWorkflow(c *fiber.Ctx) error {
    span, ctx := opentracing.StartSpanFromContext(c.Context(), "WorkflowHandler.CreateWorkflow")
    defer span.Finish()

    // Apply rate limiting
    if err := ratelimit.New(*h.rateLimiter)(c); err != nil {
        ext.Error.Set(span, true)
        span.SetTag("error", err.Error())
        return fiber.NewError(http.StatusTooManyRequests, "rate limit exceeded")
    }

    // Extract user ID from context (set by auth middleware)
    userID, ok := c.Locals("userID").(uuid.UUID)
    if !ok {
        ext.Error.Set(span, true)
        return ErrUnauthorized
    }

    // Parse and validate request
    var req CreateWorkflowRequest
    if err := c.BodyParser(&req); err != nil {
        ext.Error.Set(span, true)
        span.SetTag("error", err.Error())
        return fmt.Errorf("%w: %v", ErrInvalidRequest, err)
    }

    // Validate request size
    if c.Request().Header.ContentLength() > maxRequestSize {
        return fiber.NewError(http.StatusRequestEntityTooLarge, "request too large")
    }

    // Validate request payload
    if err := h.validateWorkflowRequest(&req); err != nil {
        ext.Error.Set(span, true)
        span.SetTag("validation_error", err.Error())
        return fmt.Errorf("%w: %v", ErrInvalidRequest, err)
    }

    // Create workflow with timeout context
    timeoutCtx, cancel := context.WithTimeout(ctx, defaultTimeout)
    defer cancel()

    workflow, err := models.NewWorkflow(userID, req.Name, req.Description)
    if err != nil {
        ext.Error.Set(span, true)
        span.SetTag("error", err.Error())
        return fmt.Errorf("%w: %v", ErrInvalidRequest, err)
    }

    // Add nodes if provided
    for _, node := range req.Nodes {
        if err := workflow.AddNode(node); err != nil {
            ext.Error.Set(span, true)
            span.SetTag("error", err.Error())
            return fmt.Errorf("%w: %v", ErrInvalidRequest, err)
        }
    }

    // Set metadata if provided
    if req.Metadata != nil {
        if err := workflow.UpdateMetadata(req.Metadata); err != nil {
            ext.Error.Set(span, true)
            span.SetTag("error", err.Error())
            return fmt.Errorf("%w: %v", ErrInvalidRequest, err)
        }
    }

    // Create workflow through service
    createdWorkflow, err := h.service.CreateWorkflow(timeoutCtx, userID, workflow)
    if err != nil {
        ext.Error.Set(span, true)
        span.SetTag("error", err.Error())
        switch {
        case err == context.DeadlineExceeded:
            return ErrTimeout
        case err == services.ErrUnauthorized:
            return ErrUnauthorized
        default:
            return fmt.Errorf("failed to create workflow: %w", err)
        }
    }

    // Set success response
    span.SetTag("workflow_id", createdWorkflow.ID.String())
    return c.Status(http.StatusCreated).JSON(createdWorkflow)
}

// validateWorkflowRequest performs comprehensive request validation
func (h *WorkflowHandler) validateWorkflowRequest(req *CreateWorkflowRequest) error {
    if err := h.validator.Struct(req); err != nil {
        return err
    }

    // Validate name length
    if len(req.Name) > maxNameLength {
        return fmt.Errorf("name exceeds maximum length of %d", maxNameLength)
    }

    // Validate description length
    if len(req.Description) > maxDescLength {
        return fmt.Errorf("description exceeds maximum length of %d", maxDescLength)
    }

    // Validate nodes if provided
    if len(req.Nodes) > 0 {
        nodeMap := make(map[uuid.UUID]bool)
        for _, node := range req.Nodes {
            // Check for duplicate node IDs
            if nodeMap[node.ID] {
                return fmt.Errorf("duplicate node ID: %s", node.ID)
            }
            nodeMap[node.ID] = true

            // Validate individual nodes
            if err := node.Validate(); err != nil {
                return fmt.Errorf("invalid node configuration: %w", err)
            }
        }
    }

    // Validate metadata size if provided
    if req.Metadata != nil {
        metadataJSON, err := json.Marshal(req.Metadata)
        if err != nil {
            return fmt.Errorf("invalid metadata format: %w", err)
        }
        if len(metadataJSON) > models.MaxMetadataSize {
            return fmt.Errorf("metadata exceeds maximum size of %d bytes", models.MaxMetadataSize)
        }
    }

    return nil
}