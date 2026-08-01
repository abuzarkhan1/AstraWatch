package config

import (
	"os"
)

type Config struct {
	Port           string
	StripeKey      string
	WebhookSecret  string
}

func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	
	stripeKey := os.Getenv("STRIPE_SECRET_KEY")
	webhookSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")

	return &Config{
		Port:          port,
		StripeKey:     stripeKey,
		WebhookSecret: webhookSecret,
	}
}
