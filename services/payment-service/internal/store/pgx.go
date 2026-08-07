package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type pgxQuerier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

type pgxExecutor interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

func pgxParseConfig(dsn string) (*pgxpool.Config, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("invalid postgres DSN: %w", err)
	}
	return cfg, nil
}

func pgxConnect(ctx context.Context, cfg *pgxpool.Config) (*pgxpool.Pool, error) {
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create postgres pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("postgres ping failed: %w", err)
	}
	return pool, nil
}

func ensureSchema(ctx context.Context, pool pgxQuerier) error {
	rows, err := pool.Query(ctx, `
		CREATE TABLE IF NOT EXISTS billing_subscriptions (
			subscription_id   TEXT PRIMARY KEY,
			customer_id       TEXT NOT NULL,
			status            TEXT NOT NULL,
			plan              TEXT NOT NULL DEFAULT '',
			current_period_end BIGINT NOT NULL DEFAULT 0,
			updated_at        BIGINT NOT NULL
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create billing_subscriptions table: %w", err)
	}
	rows.Close()

	idx, err := pool.Query(ctx, `
		CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_customer
		ON billing_subscriptions (customer_id)
	`)
	if err == nil {
		idx.Close()
	}

	// user -> Stripe customer mapping (audit: bind subscriptions/portal to the
	// JWT subject instead of trusting a client-supplied customer_id).
	cust, err := pool.Query(ctx, `
		CREATE TABLE IF NOT EXISTS billing_customers (
			user_id     TEXT PRIMARY KEY,
			customer_id TEXT NOT NULL,
			created_at  BIGINT NOT NULL
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create billing_customers table: %w", err)
	}
	cust.Close()
	return nil
}

func saveCustomer(ctx context.Context, pool pgxExecutor, m CustomerMapping) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO billing_customers (user_id, customer_id, created_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id) DO UPDATE SET
			customer_id = EXCLUDED.customer_id
	`,
		m.UserID,
		m.CustomerID,
		m.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to save customer mapping: %w", err)
	}
	return nil
}

func queryCustomer(ctx context.Context, pool pgxQuerier, userID string) (string, error) {
	rows, err := pool.Query(ctx, `
		SELECT customer_id FROM billing_customers WHERE user_id = $1
	`, userID)
	if err != nil {
		return "", fmt.Errorf("failed to query customer mapping: %w", err)
	}
	defer rows.Close()
	if rows.Next() {
		var customerID string
		if err := rows.Scan(&customerID); err != nil {
			return "", fmt.Errorf("failed to scan customer mapping: %w", err)
		}
		return customerID, nil
	}
	return "", rows.Err()
}

func queryUserByCustomer(ctx context.Context, pool pgxQuerier, customerID string) (string, error) {
	rows, err := pool.Query(ctx, `
		SELECT user_id FROM billing_customers WHERE customer_id = $1
	`, customerID)
	if err != nil {
		return "", fmt.Errorf("failed to query customer reverse mapping: %w", err)
	}
	defer rows.Close()
	if rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return "", fmt.Errorf("failed to scan customer reverse mapping: %w", err)
		}
		return userID, nil
	}
	return "", rows.Err()
}

func upsertSubscription(ctx context.Context, pool pgxExecutor, state SubscriptionState) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO billing_subscriptions
			(subscription_id, customer_id, status, plan, current_period_end, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (subscription_id) DO UPDATE SET
			customer_id = EXCLUDED.customer_id,
			status = EXCLUDED.status,
			plan = EXCLUDED.plan,
			current_period_end = EXCLUDED.current_period_end,
			updated_at = EXCLUDED.updated_at
	`,
		state.SubscriptionID,
		state.CustomerID,
		state.Status,
		state.Plan,
		state.CurrentPeriodEnd,
		state.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to upsert subscription: %w", err)
	}
	return nil
}

func querySubscriptions(ctx context.Context, pool pgxQuerier, customerID string) ([]SubscriptionState, error) {
	rows, err := pool.Query(ctx, `
		SELECT subscription_id, customer_id, status, plan, current_period_end, updated_at
		FROM billing_subscriptions
		WHERE customer_id = $1
		ORDER BY updated_at DESC
	`, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to query subscriptions: %w", err)
	}
	defer rows.Close()

	var result []SubscriptionState
	for rows.Next() {
		var s SubscriptionState
		if err := rows.Scan(&s.SubscriptionID, &s.CustomerID, &s.Status, &s.Plan, &s.CurrentPeriodEnd, &s.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan subscription: %w", err)
		}
		result = append(result, s)
	}
	return result, rows.Err()
}
