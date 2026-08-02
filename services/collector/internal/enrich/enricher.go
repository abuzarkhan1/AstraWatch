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
			e.podCache[podCacheKey(pod.Namespace, pod.Name)] = podInfo{
				Namespace: pod.Namespace,
				Labels:    pod.Labels,
				Service:   pod.Labels["app"],
			}
			e.mu.Unlock()
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			pod := newObj.(*v1.Pod)
			e.mu.Lock()
			e.podCache[podCacheKey(pod.Namespace, pod.Name)] = podInfo{
				Namespace: pod.Namespace,
				Labels:    pod.Labels,
				Service:   pod.Labels["app"],
			}
			e.mu.Unlock()
		},
		DeleteFunc: func(obj interface{}) {
			pod, ok := obj.(*v1.Pod)
			if !ok {
				if tombstone, ok := obj.(cache.DeletedFinalStateUnknown); ok {
					pod, ok = tombstone.Obj.(*v1.Pod)
					if !ok {
						return
					}
				} else {
					return
				}
			}
			e.mu.Lock()
			delete(e.podCache, podCacheKey(pod.Namespace, pod.Name))
			e.mu.Unlock()
		},
	})

	factory.Start(e.stopCh)
	factory.WaitForCacheSync(e.stopCh)
}

func (e *Enricher) EnrichBatch(batch *pkg.MetricBatch) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	if pod, ok := e.lookupPod(batch.Source, batch.Namespace); ok {
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

// EnrichMetric decorates a single metric point with pod/namespace context when
// a matching pod is known (used by the OTLP ingestion path, which produces
// per-point batches instead of a pre-grouped batch).
func (e *Enricher) EnrichMetric(m *pkg.MetricPoint) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	if m.Labels == nil {
		m.Labels = make(map[string]string)
	}
	if pod, ok := e.lookupPod(m.Labels["pod"], m.Labels["namespace"]); ok {
		m.Labels["namespace"] = pod.Namespace
		if _, exists := m.Labels["service"]; !exists {
			m.Labels["service"] = pod.Service
		}
	}
}

func (e *Enricher) EnrichLog(entry *pkg.LogEntry) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	if entry.Labels == nil {
		entry.Labels = make(map[string]string)
	}
	if pod, ok := e.lookupPod(entry.ServiceID, entry.Namespace); ok {
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
	if pod, ok := e.lookupPod(trace.ServiceID, trace.Namespace); ok {
		trace.Tags["namespace"] = pod.Namespace
	}
}

// podCacheKey namespaces the pod cache so pods with the same name in different
// namespaces (a normal Kubernetes state) never collide.
func podCacheKey(namespace, name string) string {
	return namespace + "/" + name
}

// lookupPod resolves a pod by (name, namespace). When the caller does not know the
// namespace it falls back to the first pod whose name matches, so legacy agents that
// omit namespace metadata still get enriched.
func (e *Enricher) lookupPod(name, namespace string) (podInfo, bool) {
	if namespace != "" {
		pod, ok := e.podCache[podCacheKey(namespace, name)]
		if ok {
			return pod, true
		}
	}
	// Fall back to a name-only match. Keys are "namespace/name", so the suffix we
	// compare against is "/"+name (length len(name)+1); guard against names that
	// are longer than the key to avoid a slice out-of-range panic.
	if name != "" {
		suffix := "/" + name
		for key, pod := range e.podCache {
			if len(key) >= len(suffix) && key[len(key)-len(suffix):] == suffix {
				return pod, true
			}
		}
	}
	return podInfo{}, false
}

func (e *Enricher) Stop() {
	close(e.stopCh)
}
