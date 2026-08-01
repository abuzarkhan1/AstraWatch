package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"astrawatch/payment-service/internal/config"
	"github.com/stripe/stripe-go/v78"
)

type MockStripeClient struct {
	CheckoutSession *stripe.CheckoutSession
	PortalSession   *stripe.BillingPortalSession
	Subscriptions   []*stripe.Subscription
	Err             error
}

func (m *MockStripeClient) CreateCheckoutSession(priceID, customerID, successURL, cancelURL string) (*stripe.CheckoutSession, error) {
	return m.CheckoutSession, m.Err
}

func (m *MockStripeClient) CreatePortalSession(customerID, returnURL string) (*stripe.BillingPortalSession, error) {
	return m.PortalSession, m.Err
}

func (m *MockStripeClient) GetSubscriptions(customerID string) ([]*stripe.Subscription, error) {
	return m.Subscriptions, m.Err
}

func TestHandleHealthz(t *testing.T) {
	h := NewBillingHandler(&config.Config{}, &MockStripeClient{})
	
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

func TestHandleCheckout(t *testing.T) {
	mockClient := &MockStripeClient{
		CheckoutSession: &stripe.CheckoutSession{URL: "https://checkout.stripe.com/123"},
	}
	h := NewBillingHandler(&config.Config{}, mockClient)

	body := `{"price_id":"price_123","customer_id":"cus_123","success_url":"http://ok","cancel_url":"http://no"}`
	req := httptest.NewRequest("POST", "/api/v1/billing/checkout", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	h.HandleCheckout(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	
	var res map[string]string
	json.NewDecoder(w.Body).Decode(&res)
	if res["url"] != "https://checkout.stripe.com/123" {
		t.Errorf("expected url https://checkout.stripe.com/123, got %s", res["url"])
	}
}

func TestHandlePortal(t *testing.T) {
	mockClient := &MockStripeClient{
		PortalSession: &stripe.BillingPortalSession{URL: "https://billing.stripe.com/123"},
	}
	h := NewBillingHandler(&config.Config{}, mockClient)

	body := `{"customer_id":"cus_123","return_url":"http://return"}`
	req := httptest.NewRequest("POST", "/api/v1/billing/portal", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	h.HandlePortal(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	
	var res map[string]string
	json.NewDecoder(w.Body).Decode(&res)
	if res["url"] != "https://billing.stripe.com/123" {
		t.Errorf("expected url https://billing.stripe.com/123, got %s", res["url"])
	}
}

func TestHandleSubscriptions(t *testing.T) {
	mockClient := &MockStripeClient{
		Subscriptions: []*stripe.Subscription{{ID: "sub_123"}},
	}
	h := NewBillingHandler(&config.Config{}, mockClient)

	req := httptest.NewRequest("GET", "/api/v1/billing/subscriptions?customer_id=cus_123", nil)
	w := httptest.NewRecorder()

	h.HandleSubscriptions(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}

	var subs []*stripe.Subscription
	json.NewDecoder(w.Body).Decode(&subs)
	if len(subs) != 1 || subs[0].ID != "sub_123" {
		t.Errorf("expected sub_123, got something else")
	}
}

func TestHandleWebhook(t *testing.T) {
	h := NewBillingHandler(&config.Config{WebhookSecret: "secret"}, &MockStripeClient{})
	
	req := httptest.NewRequest("POST", "/api/v1/billing/webhook", bytes.NewBufferString(`{"type":"checkout.session.completed"}`))
	req.Header.Set("Stripe-Signature", "t=123,v1=invalid")
	w := httptest.NewRecorder()
	
	h.HandleWebhook(w, req)
	
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid signature, got %d", w.Code)
	}
}
