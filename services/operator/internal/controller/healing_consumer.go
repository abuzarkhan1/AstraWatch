package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
	"go.uber.org/zap"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"k8s.io/client-go/tools/record"
)

// HealingActionMessage is the payload the orchestrator publishes to
// `healing-actions` after an action has been approved/auto-approved.
type HealingActionMessage struct {
	ActionID    string                 `json:"actionId"`
	IncidentID  string                 `json:"incidentId"`
	ActionType  string                 `json:"actionType"`
	Parameters  json.RawMessage        `json:"parameters"`
	RiskScore   int                    `json:"riskScore"`
	Timestamp   string                 `json:"timestamp"`
}

// HealingConsumer bridges the orchestrator decision plane to this execution
// plane. It consumes only approved actions, runs them through the same
// ActionExecutor (blast-radius guarded) used by the standalone reconciler, and
// reports the outcome back on healing-completed / healing-failed so the
// orchestrator can validate, complete, or roll back the action.
type HealingConsumer struct {
	client    client.Client
	logger    *zap.Logger
	recorder  record.EventRecorder
	executor  *ActionExecutor
	producer  *kgo.Client
	brokers   []string
	namespace string
}

// NewHealingConsumer creates the consumer + a producer for result events.
// brokers is a host:port list. If namespace is empty the consumer defaults the
// action namespace to "default" (or the namespace passed via parameters).
func NewHealingConsumer(c client.Client, logger *zap.Logger, recorder record.EventRecorder, dryRun bool, brokers []string, namespace string) (*HealingConsumer, error) {
	if len(brokers) == 0 {
		brokers = []string{"localhost:9092"}
	}
	producer, err := kgo.NewClient(
		kgo.SeedBrokers(brokers...),
		kgo.ProducerBatchCompression(kgo.ZstdCompression()),
		kgo.RequiredAcks(kgo.AllISRAcks()),
		kgo.ProducerLinger(200*time.Millisecond),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create healing result producer: %w", err)
	}

	return &HealingConsumer{
		client:    c,
		logger:    logger,
		recorder:  recorder,
		executor:  &ActionExecutor{Client: c, Logger: logger, Recorder: recorder, DryRun: dryRun},
		producer:  producer,
		brokers:   brokers,
		namespace: namespace,
	}, nil
}

// Start consumes healing-actions until ctx is cancelled.
func (h *HealingConsumer) Start(ctx context.Context) error {
	consumer, err := kgo.NewClient(
		kgo.SeedBrokers(h.brokers...),
		kgo.ConsumerGroup("astrawatch-operator"),
		kgo.ConsumeTopics("healing-actions"),
		kgo.DisableAutoCommit(),
	)
	if err != nil {
		return fmt.Errorf("failed to create healing consumer: %w", err)
	}
	defer consumer.Close()

	h.logger.Info("Starting healing-actions consumer", zap.String("group", "astrawatch-operator"))

	for {
		fetches := consumer.PollFetches(ctx)
		if errs := fetches.Errors(); len(errs) > 0 {
			for _, e := range errs {
				h.logger.Error("healing-actions fetch error", zap.Error(e.Err), zap.String("topic", e.Topic))
			}
			continue
		}

		fetches.EachRecord(func(record *kgo.Record) {
			actionID := h.handleMessage(ctx, record.Value)
			// handleMessage publishes a single failure event itself (keyed by the
			// parsed actionId when available) so the wrapper never double-reports.
			if actionID == "" {
				h.logger.Warn("healing action rejected before actionId could be parsed",
					zap.String("key", string(record.Key)))
			}
			consumer.CommitRecords(ctx, record)
		})
	}
}

func (h *HealingConsumer) Close() {
	h.producer.Close()
}

// handleMessage processes a single healing-actions record. It returns the parsed
// actionId ("" if the payload was unparseable) and publishes exactly one result
// event per attempt (success or failure). The caller commits the record after.
func (h *HealingConsumer) handleMessage(ctx context.Context, value []byte) string {
	var msg HealingActionMessage
	if err := json.Unmarshal(value, &msg); err != nil {
		h.logger.Error("invalid healing action payload, skipping", zap.Error(err))
		return ""
	}
	if msg.ActionID == "" || msg.ActionType == "" {
		h.logger.Error("healing action missing actionId/actionType, skipping")
		return ""
	}

	// Map orchestrator snake_case action types to the operator's executor types.
	// Unknown types are rejected explicitly rather than silently defaulted.
	actionType := mapActionType(msg.ActionType)
	if actionType == "" {
		err := fmt.Errorf("unsupported action type: %s", msg.ActionType)
		h.reportFailure(ctx, msg.ActionID, err.Error())
		return msg.ActionID
	}

	// Only orchestrator-approved (risk-scored + approved) actions are executed
	// here. The standalone reconciler path is gated separately; this consumer is
	// the orchestrator's executor and never self-approves.
	params, err := decodeParameters(msg.Parameters)
	if err != nil {
		err := fmt.Errorf("invalid action parameters: %w", err)
		h.reportFailure(ctx, msg.ActionID, err.Error())
		return msg.ActionID
	}

	// The orchestrator may pass a namespace through parameters; default to the
	// consumer's configured watch namespace, else "default".
	namespace := h.namespace
	if ns, ok := params["namespace"]; ok && ns != "" {
		namespace = ns
	}
	if namespace == "" {
		namespace = "default"
	}

	h.logger.Info("[AUDIT] Executing orchestrator-approved healing action",
		zap.String("action_id", msg.ActionID),
		zap.String("incident_id", msg.IncidentID),
		zap.String("action_type", actionType),
		zap.String("namespace", namespace),
		zap.Int("risk_score", msg.RiskScore),
	)

	err = h.executor.Execute(ctx, namespace, actionType, params, false)
	if err != nil {
		h.reportFailure(ctx, msg.ActionID, err.Error())
		return msg.ActionID
	}

	h.reportSuccess(ctx, msg.ActionID, msg.IncidentID)
	return msg.ActionID
}

// decodeParameters parses the orchestrator's parameters payload, which may arrive
// either as a JSON object ({...}) or as a double-encoded JSON string
// ("{...}" — the orchestrator serializes HealingAction.parameters, a String,
// inside its event payload). Values are coerced to strings so the executor can
// consume them (e.g. replicas as a JSON number).
func decodeParameters(raw json.RawMessage) (map[string]string, error) {
	out := map[string]string{}
	if len(raw) == 0 || string(raw) == "null" {
		return out, nil
	}

	// Case 1: a plain JSON object of scalars.
	var obj map[string]interface{}
	if err := json.Unmarshal(raw, &obj); err == nil {
		for k, v := range obj {
			out[k] = scalarToString(v)
		}
		return out, nil
	}

	// Case 2: double-encoded JSON string ("{...}") from the orchestrator.
	var nested string
	if err := json.Unmarshal(raw, &nested); err == nil {
		if nested == "" {
			// Legitimately empty parameter set.
			return out, nil
		}
		var inner map[string]interface{}
		if err := json.Unmarshal([]byte(nested), &inner); err == nil {
			for k, v := range inner {
				out[k] = scalarToString(v)
			}
			return out, nil
		}
	}

	return nil, fmt.Errorf("parameters is neither a JSON object nor a JSON string object")
}

func scalarToString(v interface{}) string {
	switch t := v.(type) {
	case string:
		return t
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", t)
	}
}

// mapActionType converts orchestrator snake_case action types to the operator's
// executor action names. Returns "" for unsupported types.
func mapActionType(actionType string) string {
	switch actionType {
	case "restart_pod", "RestartPod":
		return "RestartPod"
	case "scale_deployment", "ScaleDeployment", "ScaleReplica":
		return "ScaleReplica"
	case "rollback_deployment", "RolloutDeployment":
		return "RolloutDeployment"
	default:
		return ""
	}
}

func (h *HealingConsumer) reportSuccess(ctx context.Context, actionID, incidentID string) {
	h.publishResult(ctx, "healing-completed", actionID, map[string]interface{}{
		"actionId":   actionID,
		"incidentId": incidentID,
		"success":    true,
		"completedAt": time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *HealingConsumer) reportFailure(ctx context.Context, actionID, reason string) {
	h.publishResult(ctx, "healing-failed", actionID, map[string]interface{}{
		"actionId":   actionID,
		"success":    false,
		"error":      reason,
		"failedAt":   time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *HealingConsumer) publishResult(ctx context.Context, topic, key string, payload map[string]interface{}) {
	data, err := json.Marshal(payload)
	if err != nil {
		h.logger.Error("failed to marshal healing result", zap.Error(err))
		return
	}
	record := &kgo.Record{Topic: topic, Key: []byte(key), Value: data}
	ctxTimeout, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := h.producer.ProduceSync(ctxTimeout, record).FirstErr(); err != nil {
		h.logger.Error("failed to publish healing result", zap.Error(err), zap.String("topic", topic))
	}
}


