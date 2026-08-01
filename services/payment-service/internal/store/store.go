package store

import (
	"context"
	"log"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SubscriptionState is the normalized view of a subscription lifecycle event.
type SubscriptionState struct {
	SubscriptionID   string `json:"subscription_id"`
	CustomerID       string `json:"customer_id"`
	Status           string `json:"status"`
	Plan             string `json:"plan,omitempty"`
	CurrentPeriodEnd int64  `json:"current_period_end"`
	UpdatedAt        int64  `json:"updated_at"`
}

// SubscriptionStore persists webhook-derived subscription state so it survives
// service restarts (audit F10 — previously the webhook lifecycle was in-memory
// only and a restart lost all subscription state).
type SubscriptionStore interface {
	Upsert(ctx context.Context, state SubscriptionState) error
	ByCustomer(ctx context.Context, customerID string) ([]SubscriptionState, error)
	Close() error
}

// ── In-memory implementation (fallback when Postgres is unavailable) ───────

type MemoryStore struct {
	mu   sync.RWMutex
	subs map[string][]SubscriptionState
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{subs: make(map[string][]SubscriptionState)}
}

func (s *MemoryStore) Upsert(_ context.Context, state SubscriptionState) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	list := s.subs[state.CustomerID]
	for i, existing := range list {
		if existing.SubscriptionID == state.SubscriptionID {
			list[i] = state
			s.subs[state.CustomerID] = list
			return nil
		}
	}
	s.subs[state.CustomerID] = append(list, state)
	return nil
}

func (s *MemoryStore) ByCustomer(_ context.Context, customerID string) ([]SubscriptionState, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]SubscriptionState(nil), s.subs[customerID]...), nil
}

func (s *MemoryStore) Close() error { return nil }

// ── Postgres implementation ────────────────────────────────────────────────
// Writes are best-effort with upsert semantics; if the database is unreachable
// the store logs and falls back to the in-memory mirror so the API never fails
// because of a transient DB outage.

type PostgresStore struct {
	MemoryStore          // in-memory mirror for reads during DB outages
	pool       *pgxpool.Pool
	dbReady    bool
	dsn        string
}

func NewPostgresStore(dsn string) *PostgresStore {
	return &PostgresStore{
		MemoryStore: *NewMemoryStore(),
		dsn:         dsn,
	}
}

// Open initializes the pgx pool and creates the table if missing.
func (p *PostgresStore) Open() error {
	cfg, err := pgxParseConfig(p.dsn)
	if err != nil {
		log.Printf("Postgres store unavailable (%v) — using in-memory fallback", err)
		return err
	}
	pool, err := pgxConnect(context.Background(), cfg)
	if err != nil {
		log.Printf("Postgres store unavailable (%v) — using in-memory fallback", err)
		return err
	}
	p.pool = pool
	p.dbReady = true
	if err := ensureSchema(context.Background(), pool); err != nil {
		log.Printf("Postgres schema init failed (%v) — using in-memory fallback", err)
		p.dbReady = false
		return err
	}
	log.Println("Postgres subscription store ready")
	return nil
}

func (p *PostgresStore) Upsert(ctx context.Context, state SubscriptionState) error {
	// Always mirror in memory so reads stay consistent even if DB write fails.
	_ = p.MemoryStore.Upsert(ctx, state)

	if !p.dbReady || p.pool == nil {
		return nil
	}
	return upsertSubscription(ctx, p.pool, state)
}

func (p *PostgresStore) ByCustomer(ctx context.Context, customerID string) ([]SubscriptionState, error) {
	if p.dbReady && p.pool != nil {
		if rows, err := querySubscriptions(ctx, p.pool, customerID); err == nil && len(rows) > 0 {
			return rows, nil
		}
	}
	return p.MemoryStore.ByCustomer(ctx, customerID)
}

func (p *PostgresStore) Close() error {
	if p.pool != nil {
		p.pool.Close()
	}
	return nil
}
