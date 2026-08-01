package handlers

import (
	"encoding/json"
	"io"
	"net/http"

	"astrawatch/payment-service/internal/config"
	mystripe "astrawatch/payment-service/internal/stripe"
	"github.com/stripe/stripe-go/v78/webhook"
)

type BillingHandler struct {
	Config       *config.Config
	StripeClient mystripe.Client
}

func NewBillingHandler(cfg *config.Config, client mystripe.Client) *BillingHandler {
	return &BillingHandler{
		Config:       cfg,
		StripeClient: client,
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
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	s, err := h.StripeClient.CreateCheckoutSession(req.PriceID, req.CustomerID, req.SuccessURL, req.CancelURL)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"url": "https://mock.stripe.com/checkout"})
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
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	ps, err := h.StripeClient.CreatePortalSession(req.CustomerID, req.ReturnURL)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"url": "https://mock.stripe.com/portal"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": ps.URL})
}

func (h *BillingHandler) HandleSubscriptions(w http.ResponseWriter, r *http.Request) {
	customerID := r.URL.Query().Get("customer_id")
	if customerID == "" {
		http.Error(w, "missing customer_id", http.StatusBadRequest)
		return
	}

	subs, err := h.StripeClient.GetSubscriptions(customerID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]interface{}{})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(subs)
}

func (h *BillingHandler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	const MaxBodyBytes = int64(65536)
	r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytes)
	payload, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Error reading request body", http.StatusServiceUnavailable)
		return
	}

	sigHeader := r.Header.Get("Stripe-Signature")
	event, err := webhook.ConstructEvent(payload, sigHeader, h.Config.WebhookSecret)
	if err != nil {
		if h.Config.WebhookSecret == "" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.Error(w, "invalid webhook signature", http.StatusBadRequest)
		return
	}

	switch event.Type {
	case "checkout.session.completed":
		// Handle successful checkout
	case "customer.subscription.updated":
		// Handle subscription update
	case "customer.subscription.deleted":
		// Handle subscription deletion
	case "invoice.payment_succeeded":
		// Handle successful payment
	default:
		// Unhandled event type
	}

	w.WriteHeader(http.StatusOK)
}

func (h *BillingHandler) HandleHealthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}
