package main

import (
	"log"
	"net/http"

	"astrawatch/payment-service/internal/config"
	"astrawatch/payment-service/internal/handlers"
	mystripe "astrawatch/payment-service/internal/stripe"
)

func main() {
	cfg := config.Load()
	
	stripeClient := mystripe.NewClient(cfg.StripeKey)
	billingHandler := handlers.NewBillingHandler(cfg, stripeClient)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/billing/checkout", billingHandler.HandleCheckout)
	mux.HandleFunc("POST /api/v1/billing/portal", billingHandler.HandlePortal)
	mux.HandleFunc("GET /api/v1/billing/subscriptions", billingHandler.HandleSubscriptions)
	mux.HandleFunc("POST /api/v1/billing/webhook", billingHandler.HandleWebhook)
	mux.HandleFunc("GET /healthz", billingHandler.HandleHealthz)

	log.Printf("Starting payment-service on port %s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
