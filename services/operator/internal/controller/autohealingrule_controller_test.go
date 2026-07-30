package controller

import (
	"context"
	"testing"
	"time"

	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/record"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	astrawatchv1 "github.com/astrawatch/operator/internal/api/v1"
	"github.com/astrawatch/operator/internal/metrics"
)

func TestReconcile_AddsFinalizer(t *testing.T) {
	s := runtime.NewScheme()
	if err := scheme.AddToScheme(s); err != nil {
		t.Fatal(err)
	}
	if err := corev1.AddToScheme(s); err != nil {
		t.Fatal(err)
	}
	if err := astrawatchv1.AddToScheme(s); err != nil {
		t.Fatal(err)
	}

	rule := &astrawatchv1.AutoHealingRule{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-rule",
			Namespace: "default",
		},
		Spec: astrawatchv1.AutoHealingRuleSpec{
			TargetService: "my-service",
			Condition: astrawatchv1.AutoHealingCondition{
				Metric:    "cpu_usage",
				Operator:  ">",
				Threshold: 90.0,
			},
			Action: astrawatchv1.AutoHealingActionSpec{
				Type: "restart",
			},
		},
	}

	client := fake.NewClientBuilder().WithScheme(s).WithObjects(rule).Build()

	r := &AutoHealingRuleReconciler{
		Client:          client,
		Logger:          zap.NewNop(),
		OrchestratorURL: "http://localhost:9999",
		MetricsClient:   metrics.NewHTTPMetricsClient("http://fake:8080"),
		Recorder:        record.NewFakeRecorder(10),
	}

	req := reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "test-rule", Namespace: "default"},
	}

	result, err := r.Reconcile(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.RequeueAfter == 0 {
		t.Error("expected RequeueAfter to be set")
	}

	var updated astrawatchv1.AutoHealingRule
	if err := client.Get(context.Background(), req.NamespacedName, &updated); err != nil {
		t.Fatal(err)
	}
	if !containsFinalizer(updated.Finalizers, autoHealingFinalizer) {
		t.Error("expected finalizer to be added")
	}
}

func TestReconcile_BlocksDeletionWhenRecentlyTriggered(t *testing.T) {
	s := runtime.NewScheme()
	if err := scheme.AddToScheme(s); err != nil {
		t.Fatal(err)
	}
	if err := corev1.AddToScheme(s); err != nil {
		t.Fatal(err)
	}
	if err := astrawatchv1.AddToScheme(s); err != nil {
		t.Fatal(err)
	}

	rule := &astrawatchv1.AutoHealingRule{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "test-rule",
			Namespace:         "default",
			Finalizers:        []string{autoHealingFinalizer},
			DeletionTimestamp: &metav1.Time{Time: time.Now()},
		},
		Spec: astrawatchv1.AutoHealingRuleSpec{
			TargetService: "my-service",
			Condition: astrawatchv1.AutoHealingCondition{
				Metric:    "cpu_usage",
				Operator:  ">",
				Threshold: 90.0,
			},
			Action: astrawatchv1.AutoHealingActionSpec{
				Type: "restart",
			},
		},
		Status: astrawatchv1.AutoHealingRuleStatus{
			LastTriggered: metav1.NewTime(time.Now().Add(-1 * time.Minute)),
		},
	}

	client := fake.NewClientBuilder().WithScheme(s).WithObjects(rule).Build()

	r := &AutoHealingRuleReconciler{
		Client:          client,
		Logger:          zap.NewNop(),
		OrchestratorURL: "http://localhost:9999",
		MetricsClient:   metrics.NewHTTPMetricsClient("http://fake:8080"),
		Recorder:        record.NewFakeRecorder(10),
	}

	req := reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "test-rule", Namespace: "default"},
	}

	result, err := r.Reconcile(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.RequeueAfter == 0 {
		t.Error("expected RequeueAfter to be set (deletion blocked)")
	}

	var updated astrawatchv1.AutoHealingRule
	if err := client.Get(context.Background(), req.NamespacedName, &updated); err != nil {
		t.Fatal(err)
	}
	if !containsFinalizer(updated.Finalizers, autoHealingFinalizer) {
		t.Error("expected finalizer to remain when deletion is blocked")
	}
}

func TestReconcile_AllowsDeletionWhenCooldownElapsed(t *testing.T) {
	s := runtime.NewScheme()
	if err := scheme.AddToScheme(s); err != nil {
		t.Fatal(err)
	}
	if err := corev1.AddToScheme(s); err != nil {
		t.Fatal(err)
	}
	if err := astrawatchv1.AddToScheme(s); err != nil {
		t.Fatal(err)
	}

	rule := &astrawatchv1.AutoHealingRule{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "test-rule",
			Namespace:         "default",
			Finalizers:        []string{autoHealingFinalizer},
			DeletionTimestamp: &metav1.Time{Time: time.Now()},
		},
		Spec: astrawatchv1.AutoHealingRuleSpec{
			TargetService: "my-service",
			Condition: astrawatchv1.AutoHealingCondition{
				Metric:    "cpu_usage",
				Operator:  ">",
				Threshold: 90.0,
			},
			Action: astrawatchv1.AutoHealingActionSpec{
				Type: "restart",
			},
		},
		Status: astrawatchv1.AutoHealingRuleStatus{
			LastTriggered: metav1.NewTime(time.Now().Add(-10 * time.Minute)),
		},
	}

	client := fake.NewClientBuilder().WithScheme(s).WithObjects(rule).Build()

	r := &AutoHealingRuleReconciler{
		Client:          client,
		Logger:          zap.NewNop(),
		OrchestratorURL: "http://localhost:9999",
		MetricsClient:   metrics.NewHTTPMetricsClient("http://fake:8080"),
		Recorder:        record.NewFakeRecorder(10),
	}

	req := reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "test-rule", Namespace: "default"},
	}

	result, err := r.Reconcile(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.RequeueAfter != 0 {
		t.Error("expected no requeue after deletion is allowed")
	}

	var updated astrawatchv1.AutoHealingRule
	err = client.Get(context.Background(), req.NamespacedName, &updated)
	if err == nil && containsFinalizer(updated.Finalizers, autoHealingFinalizer) {
		t.Error("expected finalizer to be removed when cooldown elapsed")
	}
}

func TestEvaluateCondition(t *testing.T) {
	tests := []struct {
		name      string
		value     float64
		operator  string
		threshold float64
		expected  bool
	}{
		{"greater-than-true", 95, ">", 90, true},
		{"greater-than-false", 80, ">", 90, false},
		{"less-than-true", 80, "<", 90, true},
		{"less-than-false", 95, "<", 90, false},
		{"greater-or-equal-true", 90, ">=", 90, true},
		{"greater-or-equal-false", 89, ">=", 90, false},
		{"less-or-equal-true", 90, "<=", 90, true},
		{"less-or-equal-false", 91, "<=", 90, false},
		{"equal-true", 90, "==", 90, true},
		{"equal-false", 91, "==", 90, false},
		{"not-equal-true", 91, "!=", 90, true},
		{"not-equal-false", 90, "!=", 90, false},
		{"unknown-operator", 90, "??", 90, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := metrics.EvaluateCondition(tt.value, tt.operator, tt.threshold)
			if got != tt.expected {
				t.Errorf("EvaluateCondition(%v, %q, %v) = %v, want %v",
					tt.value, tt.operator, tt.threshold, got, tt.expected)
			}
		})
	}
}

func containsFinalizer(finalizers []string, target string) bool {
	for _, f := range finalizers {
		if f == target {
			return true
		}
	}
	return false
}
