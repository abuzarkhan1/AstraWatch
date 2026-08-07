package config

import (
	"os"
	"strings"
)

type Config struct {
	Port            string
	StripeKey       string
	WebhookSecret   string
	JWTSecret       string
	DatabaseURL     string
	OrchestratorURL string
	InternalToken   string
	DashboardURL    string
	// StripePriceIDs maps "plan:period" (e.g. "starter:monthly") to a Stripe
	// Price ID configured via env: STRIPE_PRICE_<PLAN>_<PERIOD>.
	StripePriceIDs map[string]string
}

// planKey normalizes a plan/period pair into the env-var segment, e.g.
// ("Pro", true) -> "pro_yearly".
func planKey(plan string, isYearly bool) string {
	period := "monthly"
	if isYearly {
		period = "yearly"
	}
	return strings.ToLower(strings.TrimSpace(plan)) + "_" + period
}

// ResolvePriceID returns the configured Stripe Price ID for a plan/period pair,
// or "" if no price is configured for it.
func (c *Config) ResolvePriceID(plan string, isYearly bool) string {
	if c.StripePriceIDs == nil {
		return ""
	}
	return c.StripePriceIDs[planKey(plan, isYearly)]
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
	orchestratorURL := os.Getenv("ORCHESTRATOR_URL")
	if orchestratorURL == "" {
		orchestratorURL = "http://localhost:8082"
	}
	internalToken := os.Getenv("INTERNAL_API_TOKEN")
	dashboardURL := os.Getenv("DASHBOARD_URL")
	if dashboardURL == "" {
		dashboardURL = "http://localhost:5173"
	}

	// Price ID mapping. Define in the Stripe Dashboard (test mode) and export:
	//   STRIPE_PRICE_STARTER_MONTHLY=price_xxx  STRIPE_PRICE_STARTER_YEARLY=price_yyy
	//   STRIPE_PRICE_PRO_MONTHLY=...            STRIPE_PRICE_PRO_YEARLY=...
	//   STRIPE_PRICE_ENTERPRISE_MONTHLY=...     STRIPE_PRICE_ENTERPRISE_YEARLY=...
	priceIDs := map[string]string{}
	for _, plan := range []string{"starter", "pro", "enterprise"} {
		for _, period := range []string{"monthly", "yearly"} {
			key := plan + "_" + period
			env := "STRIPE_PRICE_" + strings.ToUpper(plan) + "_" + strings.ToUpper(period)
			if v := os.Getenv(env); v != "" {
				priceIDs[key] = v
			}
		}
	}

	return &Config{
		Port:            port,
		StripeKey:       stripeKey,
		WebhookSecret:   webhookSecret,
		JWTSecret:       jwtSecret,
		DatabaseURL:     databaseURL,
		OrchestratorURL: strings.TrimRight(orchestratorURL, "/"),
		InternalToken:   internalToken,
		DashboardURL:    strings.TrimRight(dashboardURL, "/"),
		StripePriceIDs:  priceIDs,
	}
}
