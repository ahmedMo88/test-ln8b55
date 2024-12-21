// Package repositories provides data persistence implementations for the workflow engine
package repositories

import (
    "context"
    "database/sql"
    "encoding/json"
    "errors"
    "fmt"
    "time"
    
    "github.com/lib/pq" // v1.10.9
    "github.com/sony/gobreaker" // v2.1.0
    "github.com/avast/retry-go" // v3.0.0
    
    "internal/config"
    "internal/models"
)

// Common errors
var (
    ErrWorkflowNotFound = errors.New("workflow not found")
    ErrNodeNotFound = errors.New("node not found")
    ErrTransactionFailed = errors.New("transaction failed")
    ErrConnectionFailed = errors.New("database connection failed")
    ErrPartitionFailure = errors.New("partition operation failed")
)

// Constants for configuration
const (
    defaultRetryAttempts = 3
    defaultTimeout = time.Second * 5
    
    // SQL statements
    createWorkflowSQL = `
        INSERT INTO workflows (id, user_id, name, description, status, metadata, version, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `
    createNodeSQL = `
        INSERT INTO workflow_nodes (id, workflow_id, type, name, config, position_x, position_y, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `
    createNodeConnectionSQL = `
        INSERT INTO node_connections (source_node_id, target_node_id, type, created_at)
        VALUES ($1, $2, $3, $4)
    `
)

// PostgresRepository provides an enterprise-grade PostgreSQL implementation
type PostgresRepository struct {
    db            *sql.DB
    breaker       *gobreaker.CircuitBreaker
    preparedStmts map[string]*sql.Stmt
    cfg           *config.DatabaseConfig
}

// NewPostgresRepository creates a new PostgreSQL repository instance
func NewPostgresRepository(cfg *config.DatabaseConfig) (*PostgresRepository, error) {
    // Initialize database connection
    db, err := newPostgresDB(cfg)
    if err != nil {
        return nil, fmt.Errorf("failed to initialize database: %w", err)
    }

    // Configure circuit breaker
    breakerSettings := gobreaker.Settings{
        Name:        "postgres-breaker",
        MaxRequests: 3,
        Interval:    time.Minute,
        Timeout:     time.Minute * 2,
        ReadyToTrip: func(counts gobreaker.Counts) bool {
            failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
            return counts.Requests >= 3 && failureRatio >= 0.6
        },
    }

    // Create repository instance
    repo := &PostgresRepository{
        db:            db,
        breaker:       gobreaker.NewCircuitBreaker(breakerSettings),
        preparedStmts: make(map[string]*sql.Stmt),
        cfg:           cfg,
    }

    // Prepare statements
    if err := repo.prepareStatements(); err != nil {
        db.Close()
        return nil, fmt.Errorf("failed to prepare statements: %w", err)
    }

    return repo, nil
}

// newPostgresDB creates and configures the database connection pool
func newPostgresDB(cfg *config.DatabaseConfig) (*sql.DB, error) {
    // Build connection string with security options
    connStr := fmt.Sprintf(
        "host=%s port=%d dbname=%s user=%s password=%s sslmode=%s",
        cfg.Host, cfg.Port, cfg.Name, cfg.User, cfg.Password, cfg.SSLMode,
    )

    // Open connection with retry logic
    var db *sql.DB
    err := retry.Do(
        func() error {
            var err error
            db, err = sql.Open("postgres", connStr)
            return err
        },
        retry.Attempts(defaultRetryAttempts),
        retry.Delay(time.Second),
    )
    if err != nil {
        return nil, fmt.Errorf("failed to open database connection: %w", err)
    }

    // Configure connection pool
    db.SetMaxOpenConns(cfg.MaxConnections)
    db.SetMaxIdleConns(cfg.IdleConnections)
    db.SetConnMaxLifetime(cfg.ConnectionTimeout)

    // Verify connection
    ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
    defer cancel()
    
    if err := db.PingContext(ctx); err != nil {
        return nil, fmt.Errorf("failed to ping database: %w", err)
    }

    return db, nil
}

// prepareStatements prepares common SQL statements
func (r *PostgresRepository) prepareStatements() error {
    statements := map[string]string{
        "createWorkflow": createWorkflowSQL,
        "createNode":     createNodeSQL,
        "createNodeConnection": createNodeConnectionSQL,
    }

    for name, query := range statements {
        stmt, err := r.db.Prepare(query)
        if err != nil {
            return fmt.Errorf("failed to prepare %s: %w", name, err)
        }
        r.preparedStmts[name] = stmt
    }

    return nil
}

// CreateWorkflow persists a new workflow with its nodes
func (r *PostgresRepository) CreateWorkflow(ctx context.Context, workflow *models.Workflow) error {
    return r.breaker.Execute(func() error {
        // Start transaction
        tx, err := r.db.BeginTx(ctx, &sql.TxOptions{
            Isolation: sql.LevelSerializable,
        })
        if err != nil {
            return fmt.Errorf("failed to start transaction: %w", err)
        }
        defer tx.Rollback()

        // Insert workflow
        metadata, err := json.Marshal(workflow.GetMetadata())
        if err != nil {
            return fmt.Errorf("failed to marshal metadata: %w", err)
        }

        _, err = tx.StmtContext(ctx, r.preparedStmts["createWorkflow"]).ExecContext(ctx,
            workflow.ID,
            workflow.UserID,
            workflow.Name,
            workflow.Description,
            workflow.Status,
            metadata,
            1, // Initial version
            workflow.CreatedAt,
            workflow.UpdatedAt,
        )
        if err != nil {
            return fmt.Errorf("failed to insert workflow: %w", err)
        }

        // Insert nodes
        for _, node := range workflow.GetNodes() {
            config, err := json.Marshal(node.Config)
            if err != nil {
                return fmt.Errorf("failed to marshal node config: %w", err)
            }

            _, err = tx.StmtContext(ctx, r.preparedStmts["createNode"]).ExecContext(ctx,
                node.ID,
                workflow.ID,
                node.Type,
                node.Name,
                config,
                node.PositionX,
                node.PositionY,
                node.CreatedAt,
                node.UpdatedAt,
            )
            if err != nil {
                return fmt.Errorf("failed to insert node: %w", err)
            }

            // Insert node connections
            for _, targetID := range node.GetOutputConnections() {
                _, err = tx.StmtContext(ctx, r.preparedStmts["createNodeConnection"]).ExecContext(ctx,
                    node.ID,
                    targetID,
                    "standard",
                    time.Now().UTC(),
                )
                if err != nil {
                    return fmt.Errorf("failed to insert node connection: %w", err)
                }
            }
        }

        // Commit transaction
        if err := tx.Commit(); err != nil {
            return fmt.Errorf("failed to commit transaction: %w", err)
        }

        return nil
    })
}

// HealthCheck performs a health check of the repository
func (r *PostgresRepository) HealthCheck(ctx context.Context) (bool, error) {
    ctx, cancel := context.WithTimeout(ctx, defaultTimeout)
    defer cancel()

    err := r.db.PingContext(ctx)
    if err != nil {
        return false, fmt.Errorf("database health check failed: %w", err)
    }

    return true, nil
}

// Close closes the repository and its resources
func (r *PostgresRepository) Close() error {
    // Close prepared statements
    for _, stmt := range r.preparedStmts {
        stmt.Close()
    }

    // Close database connection
    return r.db.Close()
}