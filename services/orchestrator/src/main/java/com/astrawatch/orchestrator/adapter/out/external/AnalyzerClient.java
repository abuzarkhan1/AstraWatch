package com.astrawatch.orchestrator.adapter.out.external;

import lombok.extern.slf4j.Slf4j;
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

    public Mono<Map> getRootCause(String incidentId, int metricsWindow) {
        return webClient.post()
                .uri("/v1/anomaly/root-cause")
                .bodyValue(Map.of("incidentId", incidentId, "metricsWindow", metricsWindow))
                .retrieve()
                .bodyToMono(Map.class)
                .timeout(Duration.ofSeconds(3))
                .onErrorResume(e -> {
                    log.warn("Root cause request failed, proceeding without ML: {}", e.getMessage());
                    return Mono.just(Map.of("rankedCauses", List.of()));
                });
    }
}
