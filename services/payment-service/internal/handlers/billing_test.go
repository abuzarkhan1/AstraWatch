package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"astrawatch/payment-service/internal/config"
	"astrawatch/payment-service/internal/store"
	"github.com/stripe/stripe-go/v78"
)

type MockStripeClient struct {
	CheckoutSession *stripe.CheckoutSession
	PortalSession   *stripe.BillingPortalSession
	Subscriptions   []*stripe.Subscription
	Invoices        []*stripe.Invoice
	Customer        *stripe.Customer
	Err             error
}

func (m *MockStripeClient) CreateCheckoutSession(priceID, customerID, successURL, cancelURL string, metadata map[string]string) (*stripe.CheckoutSession, error) {
	return m.CheckoutSession, m.Err
}

func (m *MockStripeClient) CreatePortalSession(customerID, returnURL string) (*stripe.BillingPortalSession, error) {
	return m.PortalSession, m.Err
}

func (m *MockStripeClient) GetSubscriptions(customerID string) ([]*stripe.Subscription, error) {
	return m.Subscriptions, m.Err
}

func (m *MockStripeClient) GetInvoices(customerID string) ([]*stripe.Invoice, error) {
	return m.Invoices, m.Err
}

func (m *MockStripeClient) CreateCustomer(userID, email string) (*stripe.Customer, error) {
	if m.Customer != nil {
		return m.Customer, nil
	}
	return &stripe.Customer{ID: "cus_new"}, m.Err
}

// testHandler builds a handler with a configured price map and in-memory stores,
// simulating the JWT-authenticated request shape the real frontend sends.
func testHandler(t *testing.T, mock *MockStripeClient, priceIDs map[string]string) *BillingHandler {
	t.Helper()
	cfg := &config.Config{
		// Tests drive the handler with a mock Stripe client, so present a
		// configured key; the unconfigured path (clean 503) is covered by
		// TestHandleCheckout_UnconfiguredStripe below.
		StripeKey:     "sk_test_mock",
		StripePriceIDs: priceIDs,
	}
	if cfg.StripePriceIDs == nil {
		cfg.StripePriceIDs = map[string]string{}
	}
	mem := store.NewMemoryStore()
	return NewBillingHandlerWithStore(cfg, mock, mem, mem, nil)
}

func TestHandleHealthz(t *testing.T) {
	h := testHandler(t, &MockStripeClient{}, nil)
	req := httptest.NewRequest("GET", "/healthz", nil)
	w := httptest.NewRecorder()
	h.HandleHealthz(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if w.Body.String() != "ok" {
		t.Errorf("expected ok, got %s", w.Body.String())
	}
}

func TestHandleCheckout_RealContract(t *testing.T) {
	mockClient := &MockStripeClient{
		CheckoutSession: &stripe.CheckoutSession{URL: "https://checkout.stripe.com/123"},
	}
	h := testHandler(t, mockClient, map[string]string{"pro_yearly": "price_yyy"})

	// This is exactly what pricing-section-4.tsx sends today.
	body := `{"planName":"Pro","isYearly":true,"price":49}`
	req := httptest.NewRequest("POST", "/api/v1/billing/checkout-session", bytes.NewBufferString(body))
	req = WithUserID(req, "user-123")
	w := httptest.NewRecorder()

	h.HandleCheckout(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var res map[string]string
	json.NewDecoder(w.Body).Decode(&res)
	if res["url"] != "https://checkout.stripe.com/123" {
		t.Errorf("expected url, got %v", res)
	}

	// The lazy customer creation must have recorded a user→customer binding so
	// later portal/subscription calls can derive the customer from the sub.
	cid, _ := h.CustomerStore.LookupCustomer(context.Background(), "user-123")
	if cid == "" {
		t.Errorf("expected a customer mapping to be saved for user-123")
	}
}

func TestHandleCheckout_UnconfiguredStripe(t *testing.T) {
	// No Stripe key configured → the handler must answer with a clean 503
	// (audit: CI e2e has no Stripe credentials; a 500 would fail the strict
	// integration test with a misleading "billing broken" signal).
	cfg := &config.Config{StripePriceIDs: map[string]string{}}
	h := NewBillingHandlerWithStore(cfg, &MockStripeClient{}, store.NewMemoryStore(), store.NewMemoryStore(), nil)
	body := `{"planName":"Pro","isYearly":true,"price":49}`
	req := httptest.NewRequest("POST", "/api/v1/billing/checkout-session", bytes.NewBufferString(body))
	req = WithUserID(req, "user-123")
	w := httptest.NewRecorder()
	h.HandleCheckout(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503 when STRIPE_SECRET_KEY is unset, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleCheckout_UnconfiguredPlan(t *testing.T) {
	h := testHandler(t, &MockStripeClient{}, nil) // no prices configured
	body := `{"planName":"Enterprise","isYearly":false}`
	req := httptest.NewRequest("POST", "/api/v1/billing/checkout-session", bytes.NewBufferString(body))
	req = WithUserID(req, "user-123")
	w := httptest.NewRecorder()
	h.HandleCheckout(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for unconfigured plan, got %d", w.Code)
	}
}

func TestHandleCheckout_MissingUser(t *testing.T) {
	h := testHandler(t, &MockStripeClient{}, map[string]string{"starter_monthly": "price_s"})
	body := `{"planName":"Starter","isYearly":false}`
	req := httptest.NewRequest("POST", "/api/v1/billing/checkout-session", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	h.HandleCheckout(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 when JWT sub is missing, got %d", w.Code)
	}
}

func TestHandlePortal_DerivesCustomerFromSub(t *testing.T) {
	mockClient := &MockStripeClient{
		PortalSession: &stripe.BillingPortalSession{URL: "https://billing.stripe.com/123"},
	}
	h := testHandler(t, mockClient, nil)
	// Pre-seed the customer binding — this is what checkout created earlier.
	_ = h.CustomerStore.SaveCustomer(context.Background(), store.CustomerMapping{UserID: "user-123", CustomerID: "cus_123"})

	// The frontend sends NO body today; the customer must come from the JWT sub.
	req := httptest.NewRequest("POST", "/api/v1/billing/portal-session", nil)
	req = WithUserID(req, "user-123")
	w := httptest.NewRecorder()
	h.HandlePortal(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var res map[string]string
	json.NewDecoder(w.Body).Decode(&res)
	if res["url"] != "https://billing.stripe.com/123" {
		t.Errorf("expected portal url, got %v", res)
	}
}

func TestHandleSubscriptions_NoClientCustomerID(t *testing.T) {
	mockClient := &MockStripeClient{
		Subscriptions: []*stripe.Subscription{{ID: "sub_123"}},
	}
	h := testHandler(t, mockClient, nil)
	_ = h.CustomerStore.SaveCustomer(context.Background(), store.CustomerMapping{UserID: "user-123", CustomerID: "cus_123"})

	// No customer_id query param — derived from the JWT sub only (IDOR fix).
	req := httptest.NewRequest("GET", "/api/v1/billing/subscriptions", nil)
	req = WithUserID(req, "user-123")
	w := httptest.NewRecorder()
	h.HandleSubscriptions(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var subs []map[string]interface{}
	json.NewDecoder(w.Body).Decode(&subs)
	if len(subs) != 1 {
		t.Errorf("expected 1 subscription, got %d", len(subs))
	}
}

func TestHandleInvoices_DerivesCustomerAndLists(t *testing.T) {
	mockClient := &MockStripeClient{
		Invoices: []*stripe.Invoice{
			{ID: "in_1", Number: "INV-0001", Status: "paid", AmountPaid: 2999, Currency: "usd", Created: 1710000000, HostedInvoiceURL: "https://invoice.stripe.com/1"},
			{ID: "in_2", Number: "INV-0002", Status: "open", AmountPaid: 0, Currency: "usd", Created: 1712600000},
		},
	}
	h := testHandler(t, mockClient, nil)
	_ = h.CustomerStore.SaveCustomer(context.Background(), store.CustomerMapping{UserID: "user-123", CustomerID: "cus_123"})

	req := httptest.NewRequest("GET", "/api/v1/billing/invoices", nil)
	req = WithUserID(req, "user-123")
	w := httptest.NewRecorder()
	h.HandleInvoices(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var views []map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&views); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if len(views) != 2 {
		t.Fatalf("expected 2 invoices, got %d", len(views))
	}
	if views[0]["number"] != "INV-0001" {
		t.Errorf("expected INV-0001 first, got %v", views[0]["number"])
	}
	if views[0]["amount_paid"].(float64) != 2999 {
		t.Errorf("expected amount_paid 2999, got %v", views[0]["amount_paid"])
	}
}

func TestHandleInvoices_EmptyList(t *testing.T) {
	h := testHandler(t, &MockStripeClient{}, nil)
	_ = h.CustomerStore.SaveCustomer(context.Background(), store.CustomerMapping{UserID: "user-123", CustomerID: "cus_123"})

	req := httptest.NewRequest("GET", "/api/v1/billing/invoices", nil)
	req = WithUserID(req, "user-123")
	w := httptest.NewRecorder()
	h.HandleInvoices(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var views []map[string]interface{}
	_ = json.NewDecoder(w.Body).Decode(&views)
	if len(views) != 0 {
		t.Errorf("expected empty invoice list, got %d", len(views))
	}
}

func TestHandleWebhook_InvalidSignature(t *testing.T) {
	cfg := &config.Config{WebhookSecret: "secret", StripePriceIDs: map[string]string{}}
	h := NewBillingHandlerWithStore(cfg, &MockStripeClient{}, store.NewMemoryStore(), store.NewMemoryStore(), nil)
	req := httptest.NewRequest("POST", "/api/v1/billing/webhook", bytes.NewBufferString(`{"type":"checkout.session.completed"}`))
	req.Header.Set("Stripe-Signature", "t=123,v1=invalid")
	w := httptest.NewRecorder()
	h.HandleWebhook(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid signature, got %d", w.Code)
	}
}
