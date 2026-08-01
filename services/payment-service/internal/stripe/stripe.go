package stripe

import (
	"github.com/stripe/stripe-go/v78"
	portalsession "github.com/stripe/stripe-go/v78/billingportal/session"
	"github.com/stripe/stripe-go/v78/checkout/session"
	"github.com/stripe/stripe-go/v78/subscription"
)

// Define an interface for the Stripe API calls we need to abstract them for testing
type Client interface {
	CreateCheckoutSession(priceID, customerID, successURL, cancelURL string) (*stripe.CheckoutSession, error)
	CreatePortalSession(customerID, returnURL string) (*stripe.BillingPortalSession, error)
	GetSubscriptions(customerID string) ([]*stripe.Subscription, error)
}

type APIClient struct{}

func NewClient(key string) *APIClient {
	stripe.Key = key
	return &APIClient{}
}

func (c *APIClient) CreateCheckoutSession(priceID, customerID, successURL, cancelURL string) (*stripe.CheckoutSession, error) {
	params := &stripe.CheckoutSessionParams{
		Customer: stripe.String(customerID),
		PaymentMethodTypes: stripe.StringSlice([]string{
			"card",
		}),
		Mode: stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(priceID),
				Quantity: stripe.Int64(1),
			},
		},
		SuccessURL: stripe.String(successURL),
		CancelURL:  stripe.String(cancelURL),
	}
	return session.New(params)
}

func (c *APIClient) CreatePortalSession(customerID, returnURL string) (*stripe.BillingPortalSession, error) {
	params := &stripe.BillingPortalSessionParams{
		Customer:  stripe.String(customerID),
		ReturnURL: stripe.String(returnURL),
	}
	return portalsession.New(params)
}

func (c *APIClient) GetSubscriptions(customerID string) ([]*stripe.Subscription, error) {
	params := &stripe.SubscriptionListParams{
		Customer: stripe.String(customerID),
		Status:   stripe.String("active"),
	}
	iter := subscription.List(params)
	var subs []*stripe.Subscription
	for iter.Next() {
		subs = append(subs, iter.Subscription())
	}
	return subs, iter.Err()
}
