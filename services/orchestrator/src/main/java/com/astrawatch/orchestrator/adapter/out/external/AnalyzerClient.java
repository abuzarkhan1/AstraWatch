package com.astrawatch.orchestrator.adapter.out.external;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
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
     */
    @CircuitBreaker(name = "analyzer", fallbackMethod = "rootCauseFallback")
    public Mono<Map> getRootCause(String incidentId, int metricsWindow) {
        return webClient.post()
                .uri("/v1/anomaly/root-cause")
                .bodyValue(Map.of("incidentId", incidentId, "metricsWindow", metricsWindow))
                .retrieve()
                .bodyToMono(Map.class)
                .timeout(Duration.ofSeconds(3));
    }

    @SuppressWarnings("unused")
    private Mono<Map> rootCauseFallback(String incidentId, int metricsWindow, Throwable e) {
        log.warn("Root cause request failed (or circuit open), proceeding without ML: {}", e.getMessage());
        return Mono.just(Map.of("rankedCauses", List.of()));
    }
}
