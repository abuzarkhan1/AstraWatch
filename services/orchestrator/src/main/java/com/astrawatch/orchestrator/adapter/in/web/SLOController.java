package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.out.external.CollectorMetricsClient;
import com.astrawatch.orchestrator.adapter.out.persistence.SLORepository;
import com.astrawatch.orchestrator.domain.model.SLODefinition;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/slo")
@RequiredArgsConstructor
public class SLOController {

    private final SLORepository sloRepository;
    private final CollectorMetricsClient collectorMetricsClient;

    /**
     * Resolves an SLO by its catalog service id — either the collector's
     * telemetry key (e.g. "payment-api", what the frontend sends) or a legacy
     * UUID. Attainment and burn rate are computed from the collector's REAL
     * telemetry over the SLO window (audit: previously fabricated attainment
     * numbers were returned, or — after that fix — an honest empty payload that
     * never showed real values).
     */
    @GetMapping("/{serviceId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getSLO(@PathVariable String serviceId) {
        Optional<SLODefinition> slo = resolveSlo(serviceId);
        if (slo.isEmpty()) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("serviceId", serviceId);
            body.put("defined", false);
            return ResponseEntity.ok(ApiResponse.ok(body));
        }

        SLODefinition def = slo.get();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("serviceId", serviceId);
        body.put("defined", true);
        body.put("sloTarget", def.getTargetPercentage());
        body.put("metric", def.getMetric());
        body.put("windowDays", def.getWindowDays());

        // Real attainment/burnRate from live collector telemetry.
        int windowMinutes = (def.getWindowDays() != null ? def.getWindowDays() : 30) * 24 * 60;
        String key = def.getServiceKey() != null && !def.getServiceKey().isBlank()
                ? def.getServiceKey() : serviceId;
        double target = def.getTargetPercentage() != null ? def.getTargetPercentage() : 99.0;
        String metric = def.getMetric() != null ? def.getMetric() : "error_rate";

        // For percent-unit metrics (error_rate, cpu_usage, memory_usage) the
        // value is already a percentage: attainment = 100 - value.
        Optional<Double> value = collectorMetricsClient.queryAvg(key, metric, windowMinutes);
        if (value.isPresent() && isPercentMetric(metric)) {
            double avg = value.get();
            double attainment = Math.max(0.0, Math.min(100.0, 100.0 - avg));
            body.put("currentAttainment", Math.round(attainment * 100.0) / 100.0);
            double allowedError = Math.max(0.0001, 100.0 - target);
            body.put("burnRate", Math.round((avg / allowedError) * 10.0) / 10.0);
        } else if (value.isPresent()) {
            // Non-percent metric (e.g. latency_ms) — surface the real average so
            // the UI has honest context; no fabricated attainment.
            body.put("metricValue", Math.round(value.get() * 100.0) / 100.0);
        }
        return ResponseEntity.ok(ApiResponse.ok(body));
    }

    // Only telemetry metrics emitted in percent units can be turned into an
    // attainment percentage. `latency` is milliseconds and `request_rate` is
    // rps — computing attainment = 100 - value on those is nonsense (review fix:
    // latency was wrongly included, producing attainment clamped to 0 and absurd
    // burn rates).
    private static boolean isPercentMetric(String metric) {
        return metric != null && (metric.contains("error") || metric.contains("usage"));
    }

    private Optional<SLODefinition> resolveSlo(String serviceId) {
        if (serviceId == null || serviceId.isBlank()) return Optional.empty();
        // Primary path: catalog service key.
        Optional<SLODefinition> byKey = sloRepository.findFirstByServiceKey(serviceId);
        if (byKey.isPresent()) return byKey;
        // Legacy path: the id is a UUID referencing services.id.
        try {
            UUID uuid = UUID.fromString(serviceId);
            List<SLODefinition> byUuid = sloRepository.findByServiceId(uuid);
            return byUuid.isEmpty() ? Optional.empty() : Optional.of(byUuid.get(0));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    /**
     * Creates an SLO. The frontend sends the catalog service id (a string like
     * "payment-api") as serviceId — NOT a UUID. Jackson cannot bind that into a
     * UUID service_id, so accept the raw map, resolve the key, and persist it as
     * serviceKey (the SLO table's service_id is a services.id FK; catalog keys
     * live in service_key per V14).
     */
    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> createSLO(@RequestBody Map<String, Object> body) {
        String serviceId = body.get("serviceId") != null ? String.valueOf(body.get("serviceId")) : null;
        if (serviceId == null || serviceId.isBlank()) {
            return ResponseEntity.badRequest().body(new ApiResponse<>(
                    false, Map.of("error", "serviceId is required"), Map.of()));
        }
        SLODefinition slo = new SLODefinition();
        slo.setServiceKey(serviceId);
        slo.setName(body.get("name") != null ? String.valueOf(body.get("name")) : serviceId + " availability");
        // A legacy client may send a real services.id UUID — link it as the FK
        // while still keeping service_key for catalog-key resolution (review
        // fix: valid UUIDs were previously stored only as a key string).
        try {
            slo.setServiceId(UUID.fromString(serviceId));
        } catch (IllegalArgumentException e) {
            slo.setServiceId(null);
        }
        slo.setMetric(body.get("metric") != null ? String.valueOf(body.get("metric")) : "error_rate");
        slo.setTargetPercentage(body.get("targetPercentage") != null
                ? Double.parseDouble(String.valueOf(body.get("targetPercentage"))) : 99.0);
        slo.setWindowDays(body.get("windowDays") != null
                ? Integer.parseInt(String.valueOf(body.get("windowDays"))) : 30);
        SLODefinition saved = sloRepository.save(slo);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", saved.getId().toString());
        out.put("serviceId", serviceId);
        out.put("serviceKey", serviceId);
        out.put("metric", saved.getMetric());
        out.put("targetPercentage", saved.getTargetPercentage());
        out.put("windowDays", saved.getWindowDays());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(out));
    }
}
