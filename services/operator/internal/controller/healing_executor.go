package controller

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"go.uber.org/zap"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"k8s.io/client-go/tools/record"
)

// ActionExecutor runs a healing action against the cluster with the full
// blast-radius guard matrix. It is shared by the AutoHealingRule reconciler
// (standalone mode) and the HealingConsumer (orchestrator-driven mode) so that
// every executed action passes through exactly the same safety checks.
type ActionExecutor struct {
	Client   client.Client
	Logger   *zap.Logger
	Recorder record.EventRecorder
	DryRun   bool
}

// protectedNamespaces are never allowed to be mutated by healing actions.
var protectedNamespaces = map[string]bool{
	"kube-system":       true,
	"kube-public":       true,
	"kube-node-lease":   true,
	"astrawatch-system": true,
}

func (e *ActionExecutor) isProtectedNamespace(namespace string) bool {
	return protectedNamespaces[namespace]
}

// Execute applies the action described by actionType/params in the given
// namespace. It returns an error (with the reason) if any blast-radius guard
// rejects the action, and reports the action to the Kubernetes event recorder
// on every real or simulated execution.
func (e *ActionExecutor) Execute(ctx context.Context, namespace, actionType string, params map[string]string, isDryRun bool) error {
	if e.isProtectedNamespace(namespace) {
		err := fmt.Errorf("healing blocked by blast-radius check: namespace '%s' is a protected system namespace", namespace)
		e.Logger.Warn("[AUDIT] Healing action blocked by blast-radius policy", zap.String("namespace", namespace), zap.Error(err))
		return err
	}

	effectiveDryRun := e.DryRun || isDryRun

	e.Logger.Info("[AUDIT] Executing healing action",
		zap.String("audit_event", "HEALING_ACTION_EXECUTED"),
		zap.String("namespace", namespace),
		zap.String("action_type", actionType),
		zap.Bool("dry_run", effectiveDryRun),
	)

	switch actionType {
	case "RestartPod":
		podName := params["podName"]
		if podName == "" {
			return fmt.Errorf("podName parameter missing")
		}
		var pod corev1.Pod
		if err := e.Client.Get(ctx, client.ObjectKey{Name: podName, Namespace: namespace}, &pod); err != nil {
			return err
		}

		if pod.Labels["astrawatch.io/critical"] == "true" || pod.Labels["astrawatch.io/protected"] == "true" || pod.Labels["tier"] == "critical" {
			return fmt.Errorf("restart blocked by blast-radius check: pod '%s' has critical/protected label", podName)
		}
		if pod.Annotations["astrawatch.io/protected"] == "true" {
			return fmt.Errorf("restart blocked by blast-radius check: pod '%s' has protected annotation", podName)
		}

		var totalRestarts int32
		for _, cs := range pod.Status.ContainerStatuses {
			totalRestarts += cs.RestartCount
		}
		if totalRestarts > 10 {
			return fmt.Errorf("restart blocked by blast-radius check: pod '%s' has high restart count (%d > 10)", podName, totalRestarts)
		}

		if effectiveDryRun {
			e.logDryRun("Simulated pod restart", podName, namespace)
			if e.Recorder != nil {
				e.Recorder.Event(&pod, corev1.EventTypeNormal, "DryRunHealingActionExecuted", fmt.Sprintf("[DRY-RUN] Simulated pod restart for %s", podName))
			}
			return nil
		}
		e.logExecuted("Executed pod restart", podName, namespace)
		if e.Recorder != nil {
			e.Recorder.Event(&pod, corev1.EventTypeNormal, "HealingActionExecuted", fmt.Sprintf("Executed pod restart for %s in namespace %s", podName, namespace))
		}
		return e.Client.Delete(ctx, &pod)

	case "RolloutDeployment":
		deployName := params["deploymentName"]
		if deployName == "" {
			return fmt.Errorf("deploymentName parameter missing")
		}
		var deploy appsv1.Deployment
		if err := e.Client.Get(ctx, client.ObjectKey{Name: deployName, Namespace: namespace}, &deploy); err != nil {
			return err
		}

		if deploy.Labels["astrawatch.io/critical"] == "true" || deploy.Labels["astrawatch.io/protected"] == "true" || deploy.Labels["tier"] == "critical" {
			return fmt.Errorf("rollout blocked by blast-radius check: deployment '%s' is marked critical/protected", deployName)
		}
		if deploy.Status.UnavailableReplicas > 0 {
			return fmt.Errorf("rollout blocked by blast-radius check: deployment '%s' already has unavailable replicas (%d)", deployName, deploy.Status.UnavailableReplicas)
		}

		if effectiveDryRun {
			e.logDryRun("Simulated deployment rollout", deployName, namespace)
			if e.Recorder != nil {
				e.Recorder.Event(&deploy, corev1.EventTypeNormal, "DryRunHealingActionExecuted", fmt.Sprintf("[DRY-RUN] Simulated rollout for deployment %s", deployName))
			}
			return nil
		}

		if deploy.Spec.Template.Annotations == nil {
			deploy.Spec.Template.Annotations = make(map[string]string)
		}
		deploy.Spec.Template.Annotations["kubectl.kubernetes.io/restartedAt"] = time.Now().Format(time.RFC3339)

		e.logExecuted("Executed deployment rollout", deployName, namespace)
		if e.Recorder != nil {
			e.Recorder.Event(&deploy, corev1.EventTypeNormal, "HealingActionExecuted", fmt.Sprintf("Executed deployment rollout for %s in namespace %s", deployName, namespace))
		}
		return e.Client.Update(ctx, &deploy)

	case "ScaleReplica":
		deployName := params["deploymentName"]
		replicasStr := params["replicas"]
		if deployName == "" || replicasStr == "" {
			return fmt.Errorf("deploymentName or replicas missing")
		}
		replicas, err := strconv.Atoi(replicasStr)
		if err != nil || replicas < 1 {
			return fmt.Errorf("invalid replicas: %s (must be >= 1)", replicasStr)
		}
		var deploy appsv1.Deployment
		if err := e.Client.Get(ctx, client.ObjectKey{Name: deployName, Namespace: namespace}, &deploy); err != nil {
			return err
		}

		if deploy.Labels["astrawatch.io/critical"] == "true" || deploy.Labels["astrawatch.io/protected"] == "true" {
			return fmt.Errorf("scale blocked by blast-radius check: deployment '%s' is marked critical/protected", deployName)
		}
		if replicas > 50 {
			return fmt.Errorf("scale blocked by blast-radius check: requested %d replicas > max limit 50", replicas)
		}
		if deploy.Spec.Replicas != nil && *deploy.Spec.Replicas > 0 && int32(replicas) > (*deploy.Spec.Replicas)*3 {
			return fmt.Errorf("scale blocked by blast-radius check: requested replicas (%d) exceeds 3x current replicas (%d)", replicas, *deploy.Spec.Replicas)
		}

		if effectiveDryRun {
			e.Logger.Info("[AUDIT] [DRY-RUN] Simulated ScaleReplica action",
				zap.String("deployment_name", deployName),
				zap.Int("target_replicas", replicas),
				zap.String("namespace", namespace),
			)
			return nil
		}

		var rep32 int32 = int32(replicas)
		deploy.Spec.Replicas = &rep32

		e.Logger.Info("[AUDIT] Executing ScaleReplica action",
			zap.String("audit_event", "REPLICA_SCALE_EXECUTED"),
			zap.String("deployment_name", deployName),
			zap.Int32("replicas", rep32),
			zap.String("namespace", namespace),
		)
		if e.Recorder != nil {
			e.Recorder.Event(&deploy, corev1.EventTypeNormal, "HealingActionExecuted",
				fmt.Sprintf("Scaled deployment %s to %d replicas in namespace %s", deployName, rep32, namespace))
		}
		return e.Client.Update(ctx, &deploy)

	default:
		return fmt.Errorf("unsupported action type: %s", actionType)
	}
}

func (e *ActionExecutor) logDryRun(what, name, namespace string) {
	e.Logger.Info("[AUDIT] [DRY-RUN] Simulated action",
		zap.String("action", what),
		zap.String("target", name),
		zap.String("namespace", namespace),
	)
}

func (e *ActionExecutor) logExecuted(what, name, namespace string) {
	e.Logger.Info("[AUDIT] Executing action",
		zap.String("audit_event", "HEALING_ACTION_EXECUTED"),
		zap.String("action", what),
		zap.String("target", name),
		zap.String("namespace", namespace),
	)
}
