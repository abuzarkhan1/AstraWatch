package com.astrawatch.orchestrator.adapter.out.external;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class AnalyzerClient {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AnalyzerClient.class);

    private final WebClient webClient;

    public AnalyzerClient() {
        this.webClient = WebClient.builder()
                .baseUrl("http://analyzer:8000")
                .build();
    }

    /**
     * Fetches the ML root-cause diagnosis from the Analyzer, wrapped in a
     * resilience4j circuit breaker (audit Phase 7: the sync Orchestrator→Analyzer
     * call is the one cross-service hot-path that must not cascade when the
     * Analyzer is down or slow). While the breaker is OPEN the fallback returns
     * an empty diagnosis immediately and the incident proceeds without ML.
     * Config: resilience4j.circuitbreaker.configs.default.* in application.properties.
     *
     * serviceId is REQUIRED for the auto-PR pipeline: root_cause_analysis mines
     * log evidence keyed by the real service. Falling back to the incident UUID
     * would produce a generic (evidence-less) remediation PR, so the consumer
     * always forwards the actual serviceId (and tenantId when available).
     */
    @CircuitBreaker(name = "analyzer", fallbackMethod = "rootCauseFallback")
    public Mono<Map> getRootCause(String incidentId, String serviceId, String tenantId, int metricsWindow) {
        Map<String, Object> body = new HashMap<>();
        body.put("incidentId", incidentId);
        body.put("metricsWindow", metricsWindow);
        if (serviceId != null) body.put("serviceId", serviceId);
        if (tenantId != null) body.put("tenantId", tenantId);
        return webClient.post()
                .uri("/v1/anomaly/root-cause")
                .bodyValue(body)
                .retrieve()
                .bodyToMono(Map.class)
                .timeout(Duration.ofSeconds(3));
    }

    @SuppressWarnings("unused")
    private Mono<Map> rootCauseFallback(String incidentId, String serviceId, String tenantId, int metricsWindow, Throwable e) {
        log.warn("Root cause request failed (or circuit open), proceeding without ML: {}", e.getMessage());
        return Mono.just(Map.of("rankedCauses", List.of()));
    }
}
