package com.astrawatch.orchestrator.adapter.out.external;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;

/**
 * Reads aggregated metrics from the collector's internal (token-protected)
 * query endpoint. Used by the SLO attainment computation and the alert rule
 * evaluator so both compute numbers from the SAME real telemetry the
 * dashboards show — never fabricated values.
 *
 * The collector internal endpoint returns the outer envelope
 * { success, data: { value, timestamp } }.
 */
@Component
public class CollectorMetricsClient {

    private static final Logger log = LoggerFactory.getLogger(CollectorMetricsClient.class);

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final String collectorBaseUrl;
    private final String internalToken;

    public CollectorMetricsClient(@Value("${astrawatch.collector.url:http://localhost:8080}") String collectorBaseUrl,
                                  @Value("${astrawatch.internal-api-token:}") String internalToken) {
        this.collectorBaseUrl = collectorBaseUrl == null || collectorBaseUrl.isBlank()
                ? "http://localhost:8080" : collectorBaseUrl;
        this.internalToken = internalToken == null ? "" : internalToken;
    }

    /**
     * Average of {@code metric} for {@code serviceKey} over the last
     * {@code windowMinutes}. Empty when the collector is unreachable, the
     * internal token is unset, or no rows exist for the window.
     */
    public Optional<Double> queryAvg(String serviceKey, String metric, int windowMinutes) {
        if (serviceKey == null || serviceKey.isBlank() || metric == null || metric.isBlank()) {
            return Optional.empty();
        }
        try {
            String url = collectorBaseUrl + "/api/v1/metrics/query"
                    + "?service=" + java.net.URLEncoder.encode(serviceKey, java.nio.charset.StandardCharsets.UTF_8)
                    + "&metric=" + java.net.URLEncoder.encode(metric, java.nio.charset.StandardCharsets.UTF_8)
                    + "&window=" + Math.max(1, windowMinutes)
                    + "&agg=avg";
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(8));
            if (!internalToken.isBlank()) {
                builder.header("X-Internal-Token", internalToken);
            }
            HttpResponse<String> resp = httpClient.send(builder.GET().build(), HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                log.warn("Collector metrics query for {}/{} returned HTTP {}", serviceKey, metric, resp.statusCode());
                return Optional.empty();
            }
            JsonNode root = objectMapper.readTree(resp.body());
            JsonNode data = root != null ? root.get("data") : null;
            if (data == null || !data.has("value") || data.get("value").isNull()) {
                return Optional.empty();
            }
            return Optional.of(data.get("value").asDouble());
        } catch (Exception e) {
            log.warn("Collector metrics query failed for {}/{}: {}", serviceKey, metric, e.getMessage());
            return Optional.empty();
        }
    }
}
