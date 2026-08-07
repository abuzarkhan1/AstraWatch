package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"astrawatch/payment-service/internal/config"
	"astrawatch/payment-service/internal/store"
	mystripe "astrawatch/payment-service/internal/stripe"
	"github.com/stripe/stripe-go/v78"
	"github.com/stripe/stripe-go/v78/webhook"
)

// planNameFromPriceID reverses the config price map so webhooks (which carry a
// Stripe Price ID) can be resolved back to a plan name.
func planNameFromPriceID(cfg *config.Config, priceID string) string {
	for key, id := range cfg.StripePriceIDs {
		if id == priceID {
			// key is "<plan>_<period>"; strip the period suffix.
			plan := key
			if i := len(plan) - len("_monthly"); len(plan) > len("_monthly") && plan[i:] == "_monthly" {
				plan = plan[:i]
			} else if i := len(plan) - len("_yearly"); len(plan) > len("_yearly") && plan[i:] == "_yearly" {
				plan = plan[:i]
			}
			return plan
		}
	}
	return ""
}

// Notifier posts plan changes to the orchestrator so entitlements stay in sync.
type Notifier interface {
	NotifyPlanChanged(ctx context.Context, userID, plan, subscriptionID, status string) error
}

// OrchestratorNotifier is the HTTP implementation of Notifier. It is nil-safe:
// if the orchestrator is unreachable or unconfigured, the webhook still returns
// success (billing is source-of-truth; entitlement sync is best-effort).
type OrchestratorNotifier struct {
	OrchestratorURL string
	InternalToken   string
	Client          *http.Client
}

func (n *OrchestratorNotifier) NotifyPlanChanged(ctx context.Context, userID, plan, subscriptionID, status string) error {
	if n == nil || n.OrchestratorURL == "" || n.InternalToken == "" || userID == "" {
		return nil
	}
	payload, _ := json.Marshal(map[string]string{
		"userId":         userID,
		"plan":           plan,
		"subscriptionId": subscriptionID,
		"status":         status,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		n.OrchestratorURL+"/api/v1/internal/billing/plan-changed",
		bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", n.InternalToken)
	resp, err := n.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("orchestrator plan-changed returned %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func planName(session stripe.CheckoutSession) string {
	if session.LineItems != nil && len(session.LineItems.Data) > 0 && session.LineItems.Data[0].Price != nil {
		return session.LineItems.Data[0].Price.ID
	}
	if session.Subscription != nil && session.Subscription.Items != nil && len(session.Subscription.Items.Data) > 0 && session.Subscription.Items.Data[0].Price != nil {
		return session.Subscription.Items.Data[0].Price.ID
	}
	if session.Metadata != nil {
		if plan, ok := session.Metadata["plan_name"]; ok {
			return plan
		}
	}
	return ""
}

type BillingHandler struct {
	Config       *config.Config
	StripeClient mystripe.Client
	// SubscriptionStore persists webhook-derived subscription state so it
	// survives restarts (audit F10). Falls back to in-memory when Postgres is
	// unavailable.
	SubscriptionStore store.SubscriptionStore
	// CustomerStore binds a user (JWT sub) to a Stripe customer id so every
	// billing call derives the customer from the authenticated subject instead
	// of a client-supplied customer_id (audit: IDOR).
	CustomerStore store.CustomerStore
	// Notifier pushes plan changes to the orchestrator (entitlements).
	Notifier Notifier
}

func NewBillingHandler(cfg *config.Config, client mystripe.Client) *BillingHandler {
	return &BillingHandler{
		Config:            cfg,
		StripeClient:      client,
		SubscriptionStore: store.NewMemoryStore(),
		CustomerStore:     store.NewMemoryStore(),
	}
}

// NewBillingHandlerWithStore wires a persistent subscription store and customer
// store (F10) plus the orchestrator notifier.
func NewBillingHandlerWithStore(cfg *config.Config, client mystripe.Client, subscriptionStore store.SubscriptionStore, customerStore store.CustomerStore, notifier Notifier) *BillingHandler {
	return &BillingHandler{
		Config:            cfg,
		StripeClient:      client,
		SubscriptionStore: subscriptionStore,
		CustomerStore:     customerStore,
		Notifier:          notifier,
	}
}

// userIDFromContext reads the JWT subject stamped by the auth middleware.
func userIDFromContext(r *http.Request) string {
	if v, ok := r.Context().Value(ctxKeyUserID).(string); ok {
		return v
	}
	return ""
}

type ctxKey int

const ctxKeyUserID ctxKey = 1

// WithUserID stamps the authenticated subject into the request context.
func WithUserID(r *http.Request, userID string) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), ctxKeyUserID, userID))
}

// resolveCustomer returns the Stripe customer id for the authenticated user,
// creating one lazily if this is their first checkout.
func (h *BillingHandler) resolveCustomer(ctx context.Context, userID string) (string, error) {
	if userID == "" {
		return "", fmt.Errorf("authenticated user id missing from token")
	}
	if existing, err := h.CustomerStore.LookupCustomer(ctx, userID); err == nil && existing != "" {
		return existing, nil
	}
	cust, err := h.StripeClient.CreateCustomer(userID, "")
	if err != nil {
		return "", fmt.Errorf("failed to create Stripe customer: %w", err)
	}
	_ = h.CustomerStore.SaveCustomer(ctx, store.CustomerMapping{
		UserID:     userID,
		CustomerID: cust.ID,
		CreatedAt:  time.Now().Unix(),
	})
	return cust.ID, nil
}

type CheckoutRequest struct {
	PlanName   string `json:"planName"`
	IsYearly   bool   `json:"isYearly"`
	PriceID    string `json:"price_id"`    // optional override; preferred when set
	SuccessURL string `json:"success_url"` // optional; defaults to dashboard
	CancelURL  string `json:"cancel_url"`  // optional
}

func (h *BillingHandler) HandleCheckout(w http.ResponseWriter, r *http.Request) {
	var req CheckoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	// Audit fix: with no Stripe key configured (e.g. local dev / CI without
	// credentials) return a clean 503 Service Unavailable instead of failing
	// deep inside the Stripe client with a 500.
	if h.Config.StripeKey == "" {
		http.Error(w, "billing is not configured: STRIPE_SECRET_KEY is unset", http.StatusServiceUnavailable)
		return
	}

	userID := userIDFromContext(r)
	customerID, err := h.resolveCustomer(r.Context(), userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	priceID := req.PriceID
	if priceID == "" {
		priceID = h.Config.ResolvePriceID(req.PlanName, req.IsYearly)
	}
	if priceID == "" {
		http.Error(w, fmt.Sprintf("no Stripe Price configured for plan %q (period: %s). Set STRIPE_PRICE_<PLAN>_<PERIOD> env vars.", req.PlanName, map[bool]string{true: "yearly", false: "monthly"}[req.IsYearly]), http.StatusBadRequest)
		return
	}

	successURL := req.SuccessURL
	if successURL == "" {
		successURL = h.defaultSuccessURL()
	}
	cancelURL := req.CancelURL
	if cancelURL == "" {
		cancelURL = h.defaultCancelURL()
	}

	s, err := h.StripeClient.CreateCheckoutSession(priceID, customerID, successURL, cancelURL,
		map[string]string{"user_id": userID})
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to create checkout session: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": s.URL})
}

func (h *BillingHandler) defaultSuccessURL() string {
	if h.Config.DashboardURL != "" {
		return h.Config.DashboardURL + "/billing?status=success"
	}
	return "http://localhost:5173/billing?status=success"
}

func (h *BillingHandler) defaultCancelURL() string {
	if h.Config.DashboardURL != "" {
		return h.Config.DashboardURL + "/billing?status=cancelled"
	}
	return "http://localhost:5173/billing?status=cancelled"
}

type PortalRequest struct {
	ReturnURL string `json:"return_url"`
}

func (h *BillingHandler) HandlePortal(w http.ResponseWriter, r *http.Request) {
	var req PortalRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if h.Config.StripeKey == "" {
		http.Error(w, "billing is not configured: STRIPE_SECRET_KEY is unset", http.StatusServiceUnavailable)
		return
	}

	userID := userIDFromContext(r)
	customerID, err := h.resolveCustomer(r.Context(), userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	returnURL := req.ReturnURL
	if returnURL == "" {
		returnURL = h.defaultSuccessURL()
	}

	ps, err := h.StripeClient.CreatePortalSession(customerID, returnURL)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to create portal session: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": ps.URL})
}

func (h *BillingHandler) HandleSubscriptions(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	customerID, err := h.resolveCustomer(r.Context(), userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Merge the Stripe view with the webhook-driven store so lifecycle events
	// (created / updated / canceled) are reflected even before Stripe settles.
	storeSubs, _ := h.SubscriptionStore.ByCustomer(r.Context(), customerID)

	subs, err := h.StripeClient.GetSubscriptions(customerID)
	if err != nil {
		// Stripe unreachable — still return the webhook-derived state.
		w.Header().Set("Content-Type", "application/json")
		if len(storeSubs) > 0 {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"source":        "webhook-cache",
				"subscriptions": storeSubs,
			})
		} else {
			json.NewEncoder(w).Encode([]interface{}{})
		}
		return
	}

	localByID := make(map[string]store.SubscriptionState)
	for _, s := range storeSubs {
		localByID[s.SubscriptionID] = s
	}
	type subView struct {
		ID               string `json:"id"`
		CustomerID       string `json:"customer_id,omitempty"`
		Status           string `json:"status,omitempty"`
		PlanID           string `json:"plan_id,omitempty"`
		CurrentPeriodEnd int64  `json:"current_period_end,omitempty"`
		LocalStatus      string `json:"local_status,omitempty"`
	}
	views := make([]subView, 0, len(subs))
	for _, s := range subs {
		view := subView{
			ID:               s.ID,
			Status:           string(s.Status),
			CurrentPeriodEnd: s.CurrentPeriodEnd,
		}
		if s.Customer != nil {
			view.CustomerID = s.Customer.ID
		}
		if s.Items != nil && len(s.Items.Data) > 0 && s.Items.Data[0].Price != nil {
			view.PlanID = s.Items.Data[0].Price.ID
		}
		if local, ok := localByID[s.ID]; ok {
			view.LocalStatus = local.Status
		}
		views = append(views, view)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(views)
}

// notifyOrchestrator pushes a plan lifecycle event to the orchestrator for
// entitlement sync. Best-effort: failures are logged, never fatal.
func (h *BillingHandler) notifyOrchestrator(ctx context.Context, userID, plan, subscriptionID, status string) {
	if h.Notifier == nil {
		return
	}
	if err := h.Notifier.NotifyPlanChanged(ctx, userID, plan, subscriptionID, status); err != nil {
		log.Printf("billing: orchestrator plan-changed notification failed: %v", err)
	}
}

func (h *BillingHandler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	if h.Config.WebhookSecret == "" {
		http.Error(w, "webhook secret not configured on server", http.StatusInternalServerError)
		return
	}

	const MaxBodyBytes = int64(65536)
	r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytes)
	payload, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Error reading request body", http.StatusServiceUnavailable)
		return
	}

	sigHeader := r.Header.Get("Stripe-Signature")
	if sigHeader == "" {
		http.Error(w, "missing Stripe-Signature header", http.StatusBadRequest)
		return
	}

	event, err := webhook.ConstructEvent(payload, sigHeader, h.Config.WebhookSecret)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid webhook signature: %v", err), http.StatusBadRequest)
		return
	}

	now := time.Now().Unix()

	switch event.Type {
	case "checkout.session.completed":
		var session stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &session); err != nil {
			log.Printf("Error unmarshaling checkout.session.completed: %v", err)
			http.Error(w, "error parsing session payload", http.StatusBadRequest)
			return
		}
		log.Printf("[WEBHOOK] checkout.session.completed: session_id=%s, customer_id=%s, subscription_id=%s",
			session.ID, session.Customer.ID, session.Subscription.ID)
		if session.Subscription.ID != "" && session.Customer.ID != "" {
			plan := planName(session)
			_ = h.SubscriptionStore.Upsert(r.Context(), store.SubscriptionState{
				SubscriptionID: session.Subscription.ID,
				CustomerID:     session.Customer.ID,
				Status:         "active",
				Plan:           plan,
				UpdatedAt:      now,
			})
			userID := ""
			if session.Metadata != nil {
				userID = session.Metadata["user_id"]
			}
			if userID == "" {
				// Fall back to a reverse lookup when metadata is missing.
				userID = h.userIDForCustomer(r.Context(), session.Customer.ID)
			}
			h.notifyOrchestrator(r.Context(), userID, planNameFromPriceID(h.Config, plan), session.Subscription.ID, "active")
		}

	case "customer.subscription.updated":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			log.Printf("Error unmarshaling customer.subscription.updated: %v", err)
			http.Error(w, "error parsing subscription payload", http.StatusBadRequest)
			return
		}
		log.Printf("[WEBHOOK] customer.subscription.updated: subscription_id=%s, customer_id=%s, status=%s, current_period_end=%d",
			sub.ID, sub.Customer.ID, sub.Status, sub.CurrentPeriodEnd)
		if sub.ID != "" && sub.Customer.ID != "" {
			plan := ""
			if sub.Items != nil && len(sub.Items.Data) > 0 && sub.Items.Data[0].Price != nil {
				plan = sub.Items.Data[0].Price.ID
			}
			_ = h.SubscriptionStore.Upsert(r.Context(), store.SubscriptionState{
				SubscriptionID:   sub.ID,
				CustomerID:       sub.Customer.ID,
				Status:           string(sub.Status),
				Plan:             plan,
				CurrentPeriodEnd: sub.CurrentPeriodEnd,
				UpdatedAt:        now,
			})
			h.notifyOrchestrator(r.Context(), h.userIDForCustomer(r.Context(), sub.Customer.ID),
				planNameFromPriceID(h.Config, plan), sub.ID, string(sub.Status))
		}

	case "customer.subscription.deleted":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			log.Printf("Error unmarshaling customer.subscription.deleted: %v", err)
			http.Error(w, "error parsing subscription payload", http.StatusBadRequest)
			return
		}
		log.Printf("[WEBHOOK] customer.subscription.deleted: subscription_id=%s, customer_id=%s, status=%s (canceled)",
			sub.ID, sub.Customer.ID, sub.Status)
		if sub.ID != "" && sub.Customer.ID != "" {
			_ = h.SubscriptionStore.Upsert(r.Context(), store.SubscriptionState{
				SubscriptionID:   sub.ID,
				CustomerID:       sub.Customer.ID,
				Status:           "canceled",
				CurrentPeriodEnd: sub.CurrentPeriodEnd,
				UpdatedAt:        now,
			})
			h.notifyOrchestrator(r.Context(), h.userIDForCustomer(r.Context(), sub.Customer.ID),
				"", sub.ID, "canceled")
		}

	case "invoice.payment_succeeded":
		var inv stripe.Invoice
		if err := json.Unmarshal(event.Data.Raw, &inv); err != nil {
			log.Printf("Error unmarshaling invoice.payment_succeeded: %v", err)
			http.Error(w, "error parsing invoice payload", http.StatusBadRequest)
			return
		}
		log.Printf("[WEBHOOK] invoice.payment_succeeded: invoice_id=%s, customer_id=%s, amount_paid=%d, paid=%v",
			inv.ID, inv.Customer.ID, inv.AmountPaid, inv.Paid)

	case "invoice.payment_failed":
		var inv stripe.Invoice
		if err := json.Unmarshal(event.Data.Raw, &inv); err != nil {
			log.Printf("Error unmarshaling invoice.payment_failed: %v", err)
			http.Error(w, "error parsing invoice payload", http.StatusBadRequest)
			return
		}
		log.Printf("[WEBHOOK] invoice.payment_failed: invoice_id=%s, customer_id=%s, amount_due=%d, attempt_count=%d",
			inv.ID, inv.Customer.ID, inv.AmountDue, inv.AttemptCount)
		if inv.Subscription != nil && inv.Subscription.ID != "" && inv.Customer.ID != "" {
			_ = h.SubscriptionStore.Upsert(r.Context(), store.SubscriptionState{
				SubscriptionID:   inv.Subscription.ID,
				CustomerID:       inv.Customer.ID,
				Status:           "past_due",
				CurrentPeriodEnd: now,
				UpdatedAt:        now,
			})
			h.notifyOrchestrator(r.Context(), h.userIDForCustomer(r.Context(), inv.Customer.ID),
				"", inv.Subscription.ID, "past_due")
		}

	default:
		log.Printf("[WEBHOOK] Unhandled event type: %s", event.Type)
	}

	w.WriteHeader(http.StatusOK)
}

// userIDForCustomer reverse-maps a Stripe customer id to a user id via the
// customer store (falls back to the in-memory mirror).
func (h *BillingHandler) userIDForCustomer(ctx context.Context, customerID string) string {
	if lookup, ok := h.CustomerStore.(interface {
		LookupUserID(ctx context.Context, customerID string) (string, error)
	}); ok {
		if uid, err := lookup.LookupUserID(ctx, customerID); err == nil && uid != "" {
			return uid
		}
	}
	return ""
}

func (h *BillingHandler) HandleHealthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

// HandleInvoices returns the authenticated user's recent Stripe invoices
// (newest first). Unlike checkout/portal it does NOT lazy-create a Stripe
// customer — a pure GET must not mutate Stripe for users who never checked out
// (review fix); absent customer simply means no invoices. Empty list is honest
// — no fabricated invoices.
func (h *BillingHandler) HandleInvoices(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	if userID == "" {
		http.Error(w, "authenticated user id missing from token", http.StatusUnauthorized)
		return
	}
	customerID, err := h.CustomerStore.LookupCustomer(r.Context(), userID)
	if err != nil || customerID == "" {
		// Never subscribed → no invoices, no Stripe side effect.
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]interface{}{})
		return
	}

	invoices, err := h.StripeClient.GetInvoices(customerID)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to list invoices: %v", err), http.StatusInternalServerError)
		return
	}

	type invoiceView struct {
		ID             string `json:"id"`
		Number         string `json:"number"`
		Status         string `json:"status"`
		AmountPaid     int64  `json:"amount_paid"`
		Currency       string `json:"currency"`
		CreatedAt      int64  `json:"created_at"`
		HostedInvoiceURL string `json:"hosted_invoice_url,omitempty"`
		InvoicePDF     string `json:"invoice_pdf,omitempty"`
	}
	views := make([]invoiceView, 0, len(invoices))
	for _, inv := range invoices {
		views = append(views, invoiceView{
			ID:                inv.ID,
			Number:            inv.Number,
			Status:            string(inv.Status),
			AmountPaid:        inv.AmountPaid,
			Currency:          string(inv.Currency),
			CreatedAt:         inv.Created,
			HostedInvoiceURL:  inv.HostedInvoiceURL,
			InvoicePDF:        inv.InvoicePDF,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(views)
}
