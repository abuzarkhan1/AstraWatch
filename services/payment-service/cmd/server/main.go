package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"astrawatch/payment-service/internal/config"
	"astrawatch/payment-service/internal/handlers"
	"astrawatch/payment-service/internal/store"
	mystripe "astrawatch/payment-service/internal/stripe"
	"github.com/golang-jwt/jwt/v5"
)

func jwtAuthMiddleware(jwtSecret string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth == "" {
			http.Error(w, "missing authorization header", http.StatusUnauthorized)
			return
		}
		tokenString := auth
		if strings.HasPrefix(auth, "Bearer ") {
			tokenString = strings.TrimPrefix(auth, "Bearer ")
		}
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(jwtSecret), nil
		})
		if err != nil || !token.Valid {
			http.Error(w, "invalid or expired token", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func main() {
	cfg := config.Load()
	if cfg.JWTSecret == "" {
		log.Fatal("JWT_SECRET environment variable must be set — refusing to start with an empty signing key")
	}
	if cfg.StripeKey == "" {
		log.Println("WARNING: STRIPE_SECRET_KEY not set — checkout/portal calls will fail until configured")
	}
	
	stripeClient := mystripe.NewClient(cfg.StripeKey)

	// Persistent subscription store (audit F10): webhook-derived subscription
	// state is written to Postgres when DATABASE_URL is configured, falling back
	// to in-memory so the service still boots in demo mode.
	var subscriptionStore store.SubscriptionStore = store.NewMemoryStore()
	if cfg.DatabaseURL != "" {
		pgStore := store.NewPostgresStore(cfg.DatabaseURL)
		if err := pgStore.Open(); err == nil {
			subscriptionStore = pgStore
			defer pgStore.Close()
		} else {
			log.Printf("Falling back to in-memory subscription store: %v", err)
		}
	}

	billingHandler := handlers.NewBillingHandlerWithStore(cfg, stripeClient, subscriptionStore)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/billing/checkout-session", jwtAuthMiddleware(cfg.JWTSecret, billingHandler.HandleCheckout))
	mux.HandleFunc("POST /api/v1/billing/portal-session", jwtAuthMiddleware(cfg.JWTSecret, billingHandler.HandlePortal))
	mux.HandleFunc("GET /api/v1/billing/subscriptions", jwtAuthMiddleware(cfg.JWTSecret, billingHandler.HandleSubscriptions))
	mux.HandleFunc("POST /api/v1/billing/webhook", billingHandler.HandleWebhook)
	mux.HandleFunc("GET /healthz", billingHandler.HandleHealthz)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: mux,
	}

	go func() {
		log.Printf("Starting payment-service on port %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down payment-service...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}
	log.Println("Payment-service stopped gracefully")
}
