package stripe

import (
	"github.com/stripe/stripe-go/v78"
	portalsession "github.com/stripe/stripe-go/v78/billingportal/session"
	"github.com/stripe/stripe-go/v78/checkout/session"
	"github.com/stripe/stripe-go/v78/customer"
	"github.com/stripe/stripe-go/v78/invoice"
	"github.com/stripe/stripe-go/v78/subscription"
)

// Define an interface for the Stripe API calls we need to abstract them for testing
type Client interface {
	CreateCheckoutSession(priceID, customerID, successURL, cancelURL string, metadata map[string]string) (*stripe.CheckoutSession, error)
	CreatePortalSession(customerID, returnURL string) (*stripe.BillingPortalSession, error)
	GetSubscriptions(customerID string) ([]*stripe.Subscription, error)
	GetInvoices(customerID string) ([]*stripe.Invoice, error)
	CreateCustomer(userID, email string) (*stripe.Customer, error)
}

type APIClient struct{}

func NewClient(key string) *APIClient {
	stripe.Key = key
	return &APIClient{}
}

// CreateCustomer creates a Stripe Customer tagged with the AstraWatch user id so
// we can always derive the cus_* id from the JWT subject (audit: previously no
// customer was ever created, and customer_id was client-supplied).
func (c *APIClient) CreateCustomer(userID, email string) (*stripe.Customer, error) {
	params := &stripe.CustomerParams{
		Metadata: map[string]string{
			"user_id": userID,
		},
	}
	if email != "" {
		params.Email = stripe.String(email)
	}
	return customer.New(params)
}

func (c *APIClient) CreateCheckoutSession(priceID, customerID, successURL, cancelURL string, metadata map[string]string) (*stripe.CheckoutSession, error) {
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
	if len(metadata) > 0 {
		params.Metadata = metadata
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

// GetInvoices lists the most recent invoices for a customer (newest first) so
// the billing UI can render an invoice history without shipping raw card data.
func (c *APIClient) GetInvoices(customerID string) ([]*stripe.Invoice, error) {
	params := &stripe.InvoiceListParams{
		Customer: stripe.String(customerID),
	}
	params.Limit = stripe.Int64(25)
	iter := invoice.List(params)
	var invoices []*stripe.Invoice
	for iter.Next() {
		invoices = append(invoices, iter.Invoice())
	}
	return invoices, iter.Err()
}
