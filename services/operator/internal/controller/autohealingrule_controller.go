package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/log"
	"k8s.io/client-go/tools/record"

	astrawatchv1 "github.com/astrawatch/operator/internal/api/v1"
	"github.com/astrawatch/operator/internal/metrics"
)

const autoHealingFinalizer = "astrawatch.io/finalizer"

type AutoHealingRuleReconciler struct {
	client.Client
	Logger          *zap.Logger
	OrchestratorURL string
	MetricsClient   metrics.MetricsClient
	Recorder        record.EventRecorder
}

func (r *AutoHealingRuleReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	l := log.FromContext(ctx)

	var rule astrawatchv1.AutoHealingRule
	if err := r.Get(ctx, req.NamespacedName, &rule); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	if rule.ObjectMeta.DeletionTimestamp.IsZero() {
		if !controllerutil.ContainsFinalizer(&rule, autoHealingFinalizer) {
			controllerutil.AddFinalizer(&rule, autoHealingFinalizer)
			if err := r.Update(ctx, &rule); err != nil {
				return ctrl.Result{}, err
			}
		}
	} else {
		if controllerutil.ContainsFinalizer(&rule, autoHealingFinalizer) {
			lastTriggered := rule.Status.LastTriggered
			if !lastTriggered.IsZero() && time.Since(lastTriggered.Time) < 5*time.Minute {
				l.Info("deletion blocked: healing workflow in-flight", "rule", rule.Name)
				return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
			}
			l.Info("finalizer: cleaning up AutoHealingRule", "rule", rule.Name)
			controllerutil.RemoveFinalizer(&rule, autoHealingFinalizer)
			if err := r.Update(ctx, &rule); err != nil {
				return ctrl.Result{}, err
			}
		}
		return ctrl.Result{}, nil
	}

	conditionMet, err := r.evaluateCondition(ctx, rule)
	if err != nil {
		l.Error(err, "failed to evaluate condition", "rule", rule.Name)
		if r.Recorder != nil {
			r.Recorder.Event(&rule, corev1.EventTypeWarning, "ConditionEvaluationFailed", err.Error())
		}
		return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
	}

	if conditionMet {
		now := metav1.Now()
		var conditionActiveTime metav1.Time
		hasFailing := false
		for i, cond := range rule.Status.Conditions {
			if cond.Type == "ConditionFailing" {
				hasFailing = true
				if cond.Status == metav1.ConditionTrue {
					conditionActiveTime = cond.LastTransitionTime
				} else {
					rule.Status.Conditions[i].Status = metav1.ConditionTrue
					rule.Status.Conditions[i].LastTransitionTime = now
					conditionActiveTime = now
					r.Status().Update(ctx, &rule)
				}
				break
			}
		}
		if !hasFailing {
			rule.Status.Conditions = append(rule.Status.Conditions, metav1.Condition{
				Type:               "ConditionFailing",
				Status:             metav1.ConditionTrue,
				LastTransitionTime: now,
				Reason:             "ConditionMet",
			})
			r.Status().Update(ctx, &rule)
			conditionActiveTime = now
		}

		durationMet := true
		if rule.Spec.Condition.ForDuration != "" {
			d, err := time.ParseDuration(rule.Spec.Condition.ForDuration)
			if err == nil && time.Since(conditionActiveTime.Time) < d {
				durationMet = false
			}
		}

		if durationMet {
			if rule.Status.LastTriggered.IsZero() || time.Since(rule.Status.LastTriggered.Time) > 5*time.Minute {
				if err := r.triggerHealing(rule); err != nil {
					l.Error(err, "failed to trigger healing")
					if r.Recorder != nil {
						r.Recorder.Event(&rule, corev1.EventTypeWarning, "HealingTriggerFailed", err.Error())
					}
					return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
				}

				rule.Status.LastTriggered = metav1.Now()
				rule.Status.TriggerCount++
				rule.Status.Conditions = append(rule.Status.Conditions, metav1.Condition{
					Type:               "HealingTriggered",
					Status:             metav1.ConditionTrue,
					LastTransitionTime: metav1.Now(),
					Reason:             "ConditionMet",
					Message: fmt.Sprintf("Condition %s %s %f met for %s",
						rule.Spec.Condition.Metric, rule.Spec.Condition.Operator,
						rule.Spec.Condition.Threshold, rule.Spec.TargetService),
				})
				if err := r.Status().Update(ctx, &rule); err != nil {
					l.Error(err, "failed to update rule status")
				}
			}
		}
	} else {
		for i, cond := range rule.Status.Conditions {
			if cond.Type == "ConditionFailing" && cond.Status == metav1.ConditionTrue {
				rule.Status.Conditions[i].Status = metav1.ConditionFalse
				rule.Status.Conditions[i].LastTransitionTime = metav1.Now()
				r.Status().Update(ctx, &rule)
				break
			}
		}
	}

	return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
}

func (r *AutoHealingRuleReconciler) evaluateCondition(ctx context.Context, rule astrawatchv1.AutoHealingRule) (bool, error) {
	if r.MetricsClient == nil {
		return false, fmt.Errorf("metrics client not configured")
	}

	mv, err := r.MetricsClient.Query(ctx, rule.Spec.Condition.Metric, rule.Spec.TargetService)
	if err != nil {
		return false, fmt.Errorf("metrics query failed: %w", err)
	}

	return metrics.EvaluateCondition(mv.Value, rule.Spec.Condition.Operator, rule.Spec.Condition.Threshold), nil
}

func (r *AutoHealingRuleReconciler) triggerHealing(rule astrawatchv1.AutoHealingRule) error {
	payload := map[string]interface{}{
		"incidentId": nil,
		"actionType": rule.Spec.Action.Type,
		"parameters": rule.Spec.Action.Parameters,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", r.OrchestratorURL+"/api/v1/healing/trigger", bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	// Using a static operator token for now, in a real system this would come from a secret
	req.Header.Set("Authorization", "Bearer mock-team-jwt")
	req.Header.Set("Idempotency-Key", rule.Name+"-"+fmt.Sprintf("%d", time.Now().Unix()))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to call orchestrator: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("orchestrator returned status %d", resp.StatusCode)
	}

	return nil
}

func (r *AutoHealingRuleReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&astrawatchv1.AutoHealingRule{}).
		Owns(&corev1.Pod{}).
		Complete(r)
}
