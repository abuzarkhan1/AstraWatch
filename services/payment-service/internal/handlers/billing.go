package handlers

import (
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

func planName(session stripe.CheckoutSession) string {
	// LineItems is a *LineItemList in the Stripe Go SDK; Data holds the items.
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
}

func NewBillingHandler(cfg *config.Config, client mystripe.Client) *BillingHandler {
	return &BillingHandler{
		Config:            cfg,
		StripeClient:      client,
		SubscriptionStore: store.NewMemoryStore(),
	}
}

// NewBillingHandlerWithStore wires a persistent subscription store (F10).
func NewBillingHandlerWithStore(cfg *config.Config, client mystripe.Client, subscriptionStore store.SubscriptionStore) *BillingHandler {
	return &BillingHandler{
		Config:            cfg,
		StripeClient:      client,
		SubscriptionStore: subscriptionStore,
	}
}

type CheckoutRequest struct {
	PriceID    string `json:"price_id"`
	CustomerID string `json:"customer_id"`
	SuccessURL string `json:"success_url"`
	CancelURL  string `json:"cancel_url"`
}

func (h *BillingHandler) HandleCheckout(w http.ResponseWriter, r *http.Request) {
	var req CheckoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	s, err := h.StripeClient.CreateCheckoutSession(req.PriceID, req.CustomerID, req.SuccessURL, req.CancelURL)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to create checkout session: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": s.URL})
}

type PortalRequest struct {
	CustomerID string `json:"customer_id"`
	ReturnURL  string `json:"return_url"`
}

func (h *BillingHandler) HandlePortal(w http.ResponseWriter, r *http.Request) {
	var req PortalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	ps, err := h.StripeClient.CreatePortalSession(req.CustomerID, req.ReturnURL)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to create portal session: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": ps.URL})
}

func (h *BillingHandler) HandleSubscriptions(w http.ResponseWriter, r *http.Request) {
	customerID := r.URL.Query().Get("customer_id")
	if customerID == "" {
		http.Error(w, "missing customer_id parameter", http.StatusBadRequest)
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
				"source": "webhook-cache",
				"subscriptions": storeSubs,
			})
		} else {
			json.NewEncoder(w).Encode([]interface{}{})
		}
		return
	}

	// Attach the local status as an enrichment field to each Stripe subscription.
	// Use an explicit response shape (not an embedded *stripe.Subscription) so the
	// local_status field is guaranteed to serialize regardless of Stripe SDK
	// MarshalJSON behavior.
	localByID := make(map[string]store.SubscriptionState)
	for _, s := range storeSubs {
		localByID[s.SubscriptionID] = s
	}
	type subView struct {
		ID                string  `json:"id"`
		CustomerID        string  `json:"customer_id,omitempty"`
		Status            string  `json:"status,omitempty"`
		PlanID            string  `json:"plan_id,omitempty"`
		CurrentPeriodEnd  int64   `json:"current_period_end,omitempty"`
		LocalStatus       string  `json:"local_status,omitempty"`
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
			_ = h.SubscriptionStore.Upsert(r.Context(), store.SubscriptionState{
				SubscriptionID: session.Subscription.ID,
				CustomerID:     session.Customer.ID,
				Status:         "active",
				Plan:           planName(session),
				UpdatedAt:      now,
			})
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
			_ = h.SubscriptionStore.Upsert(r.Context(), store.SubscriptionState{
				SubscriptionID:   sub.ID,
				CustomerID:       sub.Customer.ID,
				Status:           string(sub.Status),
				CurrentPeriodEnd: sub.CurrentPeriodEnd,
				UpdatedAt:        now,
			})
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

	default:
		log.Printf("[WEBHOOK] Unhandled event type: %s", event.Type)
	}

	w.WriteHeader(http.StatusOK)
}

func (h *BillingHandler) HandleHealthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}
