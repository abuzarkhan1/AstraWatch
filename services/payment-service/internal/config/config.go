package config

import (
	"os"
)

type Config struct {
	Port          string
	StripeKey     string
	WebhookSecret string
	JWTSecret     string
	DatabaseURL   string
}

func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8085"
	}
	
	stripeKey := os.Getenv("STRIPE_SECRET_KEY")
	webhookSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")
	jwtSecret := os.Getenv("JWT_SECRET")
	databaseURL := os.Getenv("DATABASE_URL")

	return &Config{
		Port:          port,
		StripeKey:     stripeKey,
		WebhookSecret: webhookSecret,
		JWTSecret:     jwtSecret,
		DatabaseURL:   databaseURL,
	}
}
