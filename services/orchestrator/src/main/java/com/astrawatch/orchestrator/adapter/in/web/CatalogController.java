package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.out.external.CollectorMetricsClient;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Service Catalog. Audit fix: this used to return a hardcoded empty list and
 * had no dependencies endpoint at all — the frontend Catalog page was dead on
 * arrival. It now reads the real `services` table (V11 removed the V3 mock
 * seed, so the table only contains genuinely registered services) and surfaces
 * per-service incident-derived health, plus real dependency edges from the
 * `service_dependencies` table (V9).
 *
 * V20: now also returns the catalog metadata columns (language / owner /
 * repository / tags / serviceKey) that the CatalogPage renders — previously the
 * page conditioned on these fields and they were never populated. healthScore
 * is blended with LIVE collector telemetry (error rate + latency over the last
 * 30 minutes) so a service with a spiking error rate shows red even when it has
 * no open incidents (audit: healthScore was incident-count-only, so a service
 * could read 100% healthy while actually failing).
 */
@RestController
@RequestMapping("/api/v1/catalog")
public class CatalogController {

    private final JdbcTemplate jdbc;
    private final CollectorMetricsClient collectorMetrics;

    public CatalogController(JdbcTemplate jdbc, CollectorMetricsClient collectorMetrics) {
        this.jdbc = jdbc;
        this.collectorMetrics = collectorMetrics;
    }

    @GetMapping("/services")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getServices() {
        List<Map<String, Object>> services = jdbc.query(
                "SELECT id, name, cluster, namespace, language, owner, repository, tags, service_key "
                        + "FROM services ORDER BY name",
                (rs, i) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getString("id"));
                    row.put("name", rs.getString("name"));
                    row.put("cluster", rs.getString("cluster"));
                    row.put("namespace", rs.getString("namespace"));
                    row.put("language", rs.getString("language"));
                    row.put("owner", rs.getString("owner"));
                    row.put("repository", rs.getString("repository"));
                    row.put("tags", rs.getArray("tags") != null ? rs.getArray("tags").getArray() : null);
                    row.put("serviceKey", rs.getString("service_key") != null
                            ? rs.getString("service_key") : rs.getString("name"));
                    return row;
                });
        // Derive a live status/tier/health from open incidents AND real
        // telemetry so the catalog reflects actual operational state.
        services.forEach(row -> row.putAll(deriveHealth(row)));
        return ResponseEntity.ok(ApiResponse.ok(services));
    }

    @GetMapping("/services/{id}/dependencies")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getDependencies(@PathVariable UUID id) {
        List<Map<String, Object>> deps = jdbc.query(
                "SELECT d.kind, s.name AS target, s.id AS target_id FROM service_dependencies d " +
                        "JOIN services s ON s.id = d.depends_on WHERE d.service_id = ?::uuid ORDER BY s.name",
                (rs, i) -> Map.of(
                        "kind", rs.getString("kind") != null ? rs.getString("kind") : "RPC",
                        "target", rs.getString("target"),
                        "targetId", rs.getString("target_id")),
                id.toString());
        return ResponseEntity.ok(ApiResponse.ok(Map.of("dependencies", deps)));
    }

    /**
     * Health/tier derived from open incidents, blended with live collector
     * telemetry. incidentScore contributes 100 minus 10 per open incident;
     * telemetryScore subtracts the live error rate (percent) and a latency
     * penalty so real spikes are reflected. The final score is the minimum of
     * both signals — a high error rate can never be masked by "no open incident".
     */
    private Map<String, Object> deriveHealth(Map<String, Object> row) {
        String serviceId = (String) row.get("id");
        String serviceKey = (String) row.get("serviceKey");
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> open = jdbc.query(
                "SELECT severity FROM incidents WHERE service_id = ?::uuid AND state != 'RESOLVED'",
                (rs, i) -> Map.of("severity", rs.getString("severity")),
                serviceId);
        boolean critical = open.stream().anyMatch(r -> "CRITICAL".equals(r.get("severity")));
        boolean degraded = open.stream().anyMatch(r -> "HIGH".equals(r.get("severity")) || "MEDIUM".equals(r.get("severity")));
        int incidentScore = Math.max(0, 100 - (10 * open.size()));

        // Live telemetry over the last 30 minutes — error rate in %, latency in ms.
        // Run both collector queries in parallel so the catalog never stalls on
        // two sequential HTTP round-trips per service (review fix).
        double telemetryScore = 100.0;
        double errorRate = 0.0;
        double latencyMs = 0.0;
        java.util.concurrent.CompletableFuture<Optional<Double>> errFuture =
                java.util.concurrent.CompletableFuture.supplyAsync(() -> collectorMetrics.queryAvg(serviceKey, "error_rate", 30));
        java.util.concurrent.CompletableFuture<Optional<Double>> latFuture =
                java.util.concurrent.CompletableFuture.supplyAsync(() -> collectorMetrics.queryAvg(serviceKey, "latency", 30));
        Optional<Double> err = errFuture.join();
        Optional<Double> lat = latFuture.join();
        if (err.isPresent()) {
            errorRate = err.get();
            telemetryScore = Math.max(0.0, telemetryScore - errorRate);
        }
        if (lat.isPresent()) {
            latencyMs = lat.get();
            // Latency penalty: >500ms average starts hurting; >2s is critical.
            if (latencyMs > 500) {
                telemetryScore = Math.max(0.0, telemetryScore - ((latencyMs - 500) / 15.0));
            }
        }
        if (errorRate >= 10.0) critical = true;
        if (errorRate >= 2.0) degraded = true;

        int healthScore = (int) Math.round(Math.min(incidentScore, telemetryScore));
        out.put("status", critical ? "CRITICAL" : degraded ? "DEGRADED" : "HEALTHY");
        out.put("tier", critical ? "CRITICAL" : degraded ? "HIGH" : "STANDARD");
        out.put("healthScore", healthScore);
        out.put("errorRate", Math.round(errorRate * 100.0) / 100.0);
        out.put("latencyMs", Math.round(latencyMs * 10.0) / 10.0);
        return out;
    }
}
