package main

import (
	"context"
	"flag"
	"net/http"
	"os"
	"strings"

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
	var dryRun bool
	var kafkaBrokers string
	var watchNamespace string
	// standaloneTrigger keeps the operator's own rule-evaluation loop. It defaults
	// to false so the orchestrator is the single healing decision authority
	// (audit F2); operators that want in-cluster self-service healing can enable
	// it explicitly.
	var standaloneTrigger bool
	flag.StringVar(&orchestratorURL, "orchestrator-url", "http://orchestrator:8081", "The URL of the Orchestrator service.")
	flag.StringVar(&metricsURL, "metrics-url", "http://collector:8080", "The URL of the metrics service.")
	flag.BoolVar(&dryRun, "dry-run", false, "Enable dry-run mode to simulate healing actions without mutating resources.")
	flag.StringVar(&kafkaBrokers, "kafka-brokers", envOr("KAFKA_BROKERS", "localhost:9092"), "Comma-separated Kafka broker list.")
	flag.StringVar(&watchNamespace, "watch-namespace", os.Getenv("WATCH_NAMESPACE"), "Namespace to watch for AutoHealingRules (empty = cluster-scoped).")
	flag.BoolVar(&standaloneTrigger, "standalone-trigger", false, "Allow the operator to trigger healing from its own rule evaluation loop. Default false: the orchestrator is the single decision authority.")
	flag.Parse()

	ctrl.SetLogger(ctrlzap.New())

	logger, _ := zap.NewProduction()

	scheme := runtime.NewScheme()
	_ = clientgoscheme.AddToScheme(scheme)
	_ = corev1.AddToScheme(scheme)
	_ = astrawatchv1.AddToScheme(scheme)

	cfg, err := ctrl.GetConfig()
	if err != nil {
		logger.Info("running without k8s, starting only healthz on 8081")
		http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(200)
		})
		go http.ListenAndServe(":8081", nil)
		select {}
	}
	mgr, err := ctrl.NewManager(cfg, ctrl.Options{
		Scheme:                  scheme,
		LeaderElection:          true,
		LeaderElectionID:        "astrawatch-operator-leader",
		LeaderElectionNamespace: "astrawatch-system",
	})
	if err != nil {
		logger.Fatal("unable to start manager", zap.Error(err))
	}

	metricsClient := metrics.NewHTTPMetricsClient(metricsURL)

	if err := (&controller.AutoHealingRuleReconciler{
		Client:            mgr.GetClient(),
		Logger:            logger,
		OrchestratorURL:   orchestratorURL,
		MetricsClient:     metricsClient,
		Recorder:          mgr.GetEventRecorderFor("autohealingrule-controller"),
		DryRun:            dryRun,
		StandaloneTrigger: standaloneTrigger,
	}).SetupWithManager(mgr); err != nil {
		logger.Fatal("unable to create controller", zap.Error(err))
	}

	// Orchestrator-driven healing: consume approved healing-actions from Kafka and
	// execute them with the shared blast-radius guard matrix, reporting the result
	// back to the orchestrator.
	brokers := splitComma(kafkaBrokers)
	healingConsumer, err := controller.NewHealingConsumer(
		mgr.GetClient(), logger, mgr.GetEventRecorderFor("healing-consumer"), dryRun, brokers, watchNamespace,
	)
	if err != nil {
		logger.Fatal("unable to create healing consumer", zap.Error(err))
	}
	consumerCtx, cancelConsumer := context.WithCancel(context.Background())
	go func() {
		if err := healingConsumer.Start(consumerCtx); err != nil {
			logger.Error("healing consumer stopped", zap.Error(err))
		}
	}()
	defer func() {
		cancelConsumer()
		healingConsumer.Close()
	}()

	if err := mgr.AddHealthzCheck("healthz", func(req *http.Request) error { return nil }); err != nil {
		logger.Info("health check not available", zap.Error(err))
	}

	logger.Info("starting operator",
		zap.Bool("standalone_trigger", standaloneTrigger),
		zap.Strings("kafka_brokers", brokers),
	)
	if err := mgr.Start(ctrl.SetupSignalHandler()); err != nil {
		logger.Fatal("problem running manager", zap.Error(err))
	}
}

func envOr(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func splitComma(s string) []string {
	if s == "" {
		return []string{"localhost:9092"}
	}
	parts := strings.Split(s, ",")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	return parts
}
