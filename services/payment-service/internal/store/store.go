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

// CustomerMapping binds an AstraWatch user id (JWT sub) to a Stripe customer id
// (cus_*). This is what lets us derive the Stripe customer from the JWT subject
// instead of trusting a client-supplied customer_id (audit: IDOR on
// subscriptions/portal — any authenticated user could read another customer's
// subscriptions).
type CustomerMapping struct {
	UserID     string `json:"user_id"`
	CustomerID string `json:"customer_id"`
	CreatedAt  int64  `json:"created_at"`
}

// CustomerStore persists user→customer mappings.
type CustomerStore interface {
	// LookupCustomer returns the Stripe customer id for a user, or "" if none.
	LookupCustomer(ctx context.Context, userID string) (string, error)
	// SaveCustomer records a user→customer binding (idempotent).
	SaveCustomer(ctx context.Context, mapping CustomerMapping) error
	// LookupUserID returns the user id for a Stripe customer id (reverse map,
	// used by webhooks that only carry cus_* ids).
	LookupUserID(ctx context.Context, customerID string) (string, error)
}

// ── In-memory implementation (fallback when Postgres is unavailable) ───────

type MemoryStore struct {
	mu   sync.RWMutex
	subs map[string][]SubscriptionState
	cust map[string]string // userID -> customerID
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		subs: make(map[string][]SubscriptionState),
		cust: make(map[string]string),
	}
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

func (s *MemoryStore) LookupCustomer(_ context.Context, userID string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cust[userID], nil
}

func (s *MemoryStore) SaveCustomer(_ context.Context, mapping CustomerMapping) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cust[mapping.UserID] = mapping.CustomerID
	return nil
}

func (s *MemoryStore) LookupUserID(_ context.Context, customerID string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for uid, cid := range s.cust {
		if cid == customerID {
			return uid, nil
		}
	}
	return "", nil
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

// Open initializes the pgx pool and creates the tables if missing.
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

func (p *PostgresStore) LookupCustomer(ctx context.Context, userID string) (string, error) {
	if p.dbReady && p.pool != nil {
		if id, err := queryCustomer(ctx, p.pool, userID); err == nil && id != "" {
			return id, nil
		}
	}
	return p.MemoryStore.LookupCustomer(ctx, userID)
}

func (p *PostgresStore) SaveCustomer(ctx context.Context, mapping CustomerMapping) error {
	_ = p.MemoryStore.SaveCustomer(ctx, mapping)
	if !p.dbReady || p.pool == nil {
		return nil
	}
	return saveCustomer(ctx, p.pool, mapping)
}

func (p *PostgresStore) LookupUserID(ctx context.Context, customerID string) (string, error) {
	if p.dbReady && p.pool != nil {
		if uid, err := queryUserByCustomer(ctx, p.pool, customerID); err == nil && uid != "" {
			return uid, nil
		}
	}
	return p.MemoryStore.LookupUserID(ctx, customerID)
}

func (p *PostgresStore) Close() error {
	if p.pool != nil {
		p.pool.Close()
	}
	return nil
}
