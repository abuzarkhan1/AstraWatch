package controller

import (
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"sigs.k8s.io/controller-runtime/pkg/metrics"
)

// MTTR telemetry (audit Phase 7 / Phase B): the documentation claims a 3-second
// mean-time-to-remediation. Until this pass there was no measurement code at
// all. The histogram below records the time between the orchestrator publishing
// an approved healing action and the operator finishing execution, so the claim
// becomes verifiable (and alertable) instead of aspirational.

var (
	healingActionDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "astrawatch_healing_action_duration_seconds",
			Help:    "Time from orchestrator-approved healing action to execution completion (MTTR).",
			Buckets: prometheus.ExponentialBuckets(0.05, 2, 10), // 50ms .. ~51s
		},
		[]string{"action_type"},
	)

	healingActionsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "astrawatch_healing_actions_total",
			Help: "Total healing actions executed by the operator, by type and result.",
		},
		[]string{"action_type", "result"}, // result: success | failure
	)
)

func init() {
	// Register with the controller-runtime registry so the operator's built-in
	// /metrics endpoint (metricsserver) serves them — no extra handler needed.
	metrics.Registry.MustRegister(healingActionDuration, healingActionsTotal)
}

// RecordHealingOutcome observes the MTTR histogram and increments the result
// counter for a completed healing action attempt.
func RecordHealingOutcome(actionType string, startedAt time.Time, err error) {
	duration := time.Since(startedAt).Seconds()
	healingActionDuration.WithLabelValues(actionType).Observe(duration)

	result := "success"
	if err != nil {
		result = "failure"
	}
	healingActionsTotal.WithLabelValues(actionType, result).Inc()
}
