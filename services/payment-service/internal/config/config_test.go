package config

import (
	"os"
	"testing"
)

func TestLoad(t *testing.T) {
	os.Setenv("PORT", "9090")
	os.Setenv("STRIPE_SECRET_KEY", "sk_test_123")
	os.Setenv("STRIPE_WEBHOOK_SECRET", "whsec_123")
	defer os.Clearenv()

	cfg := Load()

	if cfg.Port != "9090" {
		t.Errorf("expected port 9090, got %s", cfg.Port)
	}
	if cfg.StripeKey != "sk_test_123" {
		t.Errorf("expected StripeKey sk_test_123, got %s", cfg.StripeKey)
	}
	if cfg.WebhookSecret != "whsec_123" {
		t.Errorf("expected WebhookSecret whsec_123, got %s", cfg.WebhookSecret)
	}
}

func TestLoad_Defaults(t *testing.T) {
	os.Clearenv()
	cfg := Load()

	if cfg.Port != "8085" {
		t.Errorf("expected default port 8085, got %s", cfg.Port)
	}
}
