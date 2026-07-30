package main

import (
	"flag"
	"net/http"

	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	ctrl "sigs.k8s.io/controller-runtime"
	ctrlzap "sigs.k8s.io/controller-runtime/pkg/log/zap"

	astrawatchv1 "github.com/astrawatch/operator/internal/api/v1"
	"github.com/astrawatch/operator/internal/controller"
	"github.com/astrawatch/operator/internal/metrics"
)

func main() {
	var orchestratorURL string
	var metricsURL string
	flag.StringVar(&orchestratorURL, "orchestrator-url", "http://orchestrator:8081", "The URL of the Orchestrator service.")
	flag.StringVar(&metricsURL, "metrics-url", "http://collector:8080", "The URL of the metrics service.")
	flag.Parse()

	ctrl.SetLogger(ctrlzap.New())

	logger, _ := zap.NewProduction()

	scheme := runtime.NewScheme()
	_ = clientgoscheme.AddToScheme(scheme)
	_ = corev1.AddToScheme(scheme)
	_ = astrawatchv1.AddToScheme(scheme)

	mgr, err := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{
		Scheme: scheme,
	})
	if err != nil {
		logger.Fatal("unable to start manager", zap.Error(err))
	}

	metricsClient := metrics.NewHTTPMetricsClient(metricsURL)

	if err := (&controller.AutoHealingRuleReconciler{
		Client:          mgr.GetClient(),
		Logger:          logger,
		OrchestratorURL: orchestratorURL,
		MetricsClient:   metricsClient,
		Recorder:        mgr.GetEventRecorderFor("autohealingrule-controller"),
	}).SetupWithManager(mgr); err != nil {
		logger.Fatal("unable to create controller", zap.Error(err))
	}

	if err := mgr.AddHealthzCheck("healthz", func(req *http.Request) error { return nil }); err != nil {
		logger.Info("health check not available", zap.Error(err))
	}

	logger.Info("starting operator")
	if err := mgr.Start(ctrl.SetupSignalHandler()); err != nil {
		logger.Fatal("problem running manager", zap.Error(err))
	}
}
