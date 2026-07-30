package enrich

import (
	"log"
	"sync"
	"time"

	"github.com/astrawatch/collector/pkg"
	v1 "k8s.io/api/core/v1"

	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"
)

type Enricher struct {
	mu          sync.RWMutex
	podCache    map[string]podInfo
	namespaceCache map[string]namespaceInfo
	stopCh      chan struct{}
}

type podInfo struct {
	Namespace string
	Cluster   string
	Labels    map[string]string
	Service   string
}

type namespaceInfo struct {
	Name   string
	Labels map[string]string
}

func NewEnricher() *Enricher {
	e := &Enricher{
		podCache:    make(map[string]podInfo),
		namespaceCache: make(map[string]namespaceInfo),
		stopCh:      make(chan struct{}),
	}
	go e.startK8sWatch()
	return e
}

func (e *Enricher) startK8sWatch() {
	config, err := rest.InClusterConfig()
	if err != nil {
		log.Printf("kubernetes not available, enrichment disabled: %v", err)
		return
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		log.Printf("failed to create kubernetes client: %v", err)
		return
	}

	factory := informers.NewSharedInformerFactory(clientset, 30*time.Second)

	podInformer := factory.Core().V1().Pods().Informer()
	_, _ = podInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			pod := obj.(*v1.Pod)
			e.mu.Lock()
			e.podCache[pod.Name] = podInfo{
				Namespace: pod.Namespace,
				Labels:    pod.Labels,
				Service:   pod.Labels["app"],
			}
			e.mu.Unlock()
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			pod := newObj.(*v1.Pod)
			e.mu.Lock()
			e.podCache[pod.Name] = podInfo{
				Namespace: pod.Namespace,
				Labels:    pod.Labels,
				Service:   pod.Labels["app"],
			}
			e.mu.Unlock()
		},
		DeleteFunc: func(obj interface{}) {
			pod := obj.(*v1.Pod)
			e.mu.Lock()
			delete(e.podCache, pod.Name)
			e.mu.Unlock()
		},
	})

	factory.Start(e.stopCh)
	factory.WaitForCacheSync(e.stopCh)
}

func (e *Enricher) EnrichBatch(batch *pkg.MetricBatch) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	if pod, ok := e.podCache[batch.Source]; ok {
		if batch.Namespace == "" {
			batch.Namespace = pod.Namespace
		}
		for i, m := range batch.Metrics {
			if m.Labels == nil {
				m.Labels = make(map[string]string)
			}
			m.Labels["namespace"] = pod.Namespace
			m.Labels["pod"] = batch.Source
			if _, exists := m.Labels["service"]; !exists {
				m.Labels["service"] = pod.Service
			}
			batch.Metrics[i] = m
		}
	}
}

func (e *Enricher) EnrichLog(entry *pkg.LogEntry) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	if entry.Labels == nil {
		entry.Labels = make(map[string]string)
	}
	if pod, ok := e.podCache[entry.ServiceID]; ok {
		entry.Labels["namespace"] = pod.Namespace
		entry.Labels["service"] = pod.Service
	}
}

func (e *Enricher) EnrichTrace(trace *pkg.TraceSpan) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	if trace.Tags == nil {
		trace.Tags = make(map[string]string)
	}
	if pod, ok := e.podCache[trace.ServiceID]; ok {
		trace.Tags["namespace"] = pod.Namespace
	}
}

func (e *Enricher) Stop() {
	close(e.stopCh)
}
