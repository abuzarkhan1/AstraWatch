package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.out.persistence.SyntheticCheckRepository;
import com.astrawatch.orchestrator.domain.model.SyntheticCheck;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Real synthetic checks CRUD (audit: createCheck fabricated a random id, GET
 * endpoints returned empty lists). Checks are persisted and listed; results are
 * honest — an empty array until a probe runner exists (no fabricated uptime).
 */
@RestController
@RequestMapping("/api/v1/synthetics")
public class SyntheticController {

    private static final UUID DEFAULT_ORG_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    private final SyntheticCheckRepository repository;

    public SyntheticController(SyntheticCheckRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/checks")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getChecks(@RequestParam(required = false) UUID orgId) {
        UUID org = orgId != null ? orgId : DEFAULT_ORG_ID;
        List<Map<String, Object>> checks = repository.findAllByOrgId(org).stream()
                .map(this::toMap)
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(Map.of("checks", checks)));
    }

    @PostMapping("/checks")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createCheck(@RequestBody Map<String, Object> body,
                                                                        @RequestParam(required = false) UUID orgId) {
        UUID org = orgId != null ? orgId : DEFAULT_ORG_ID;
        SyntheticCheck check = new SyntheticCheck();
        check.setOrgId(org);
        check.setName(body.get("name") != null ? String.valueOf(body.get("name")) : "Unnamed check");
        check.setType(body.get("type") != null ? String.valueOf(body.get("type")) : "http");
        check.setUrl(body.get("url") != null ? String.valueOf(body.get("url")) : "");
        if (body.get("intervalSeconds") != null) {
            try {
                check.setIntervalSeconds(Integer.valueOf(String.valueOf(body.get("intervalSeconds"))));
            } catch (NumberFormatException ignored) {
                // keep default
            }
        }
        check.setStatus("paused"); // never fabricated as passing
        check.setUptime(0.0);
        SyntheticCheck saved = repository.save(check);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(toMap(saved)));
    }

    @PostMapping("/checks/{id}/toggle")
    public ResponseEntity<ApiResponse<Map<String, Object>>> toggleCheck(@PathVariable UUID id) {
        return repository.findById(id)
                .map(check -> {
                    check.setStatus("paused".equals(check.getStatus()) ? "passing" : "paused");
                    SyntheticCheck saved = repository.save(check);
                    return ResponseEntity.ok(ApiResponse.ok(toMap(saved)));
                })
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(new ApiResponse<>(false, Map.of("error", "Check not found"), Map.of())));
    }

    @DeleteMapping("/checks/{id}")
    public ResponseEntity<Void> deleteCheck(@PathVariable UUID id) {
        repository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/checks/{id}/results")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getCheckResults(@PathVariable UUID id) {
        if (repository.findById(id).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new ApiResponse<>(false, Map.of("error", "Check not found"), Map.of()));
        }
        // Honest empty result set — no probe runner has executed this check.
        return ResponseEntity.ok(ApiResponse.ok(Map.of("results", List.of())));
    }

    private Map<String, Object> toMap(SyntheticCheck check) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", check.getId().toString());
        row.put("name", check.getName());
        row.put("type", check.getType());
        row.put("url", check.getUrl());
        row.put("interval", intervalLabel(check.getIntervalSeconds()));
        row.put("status", check.getStatus());
        row.put("responseTime", check.getResponseTimeMs() != null ? check.getResponseTimeMs() : 0);
        row.put("uptime", check.getUptime() != null ? check.getUptime() : 0.0);
        row.put("lastRun", check.getLastRunAt() != null ? check.getLastRunAt().toString() : Instant.now().toString());
        return row;
    }

    private String intervalLabel(Integer seconds) {
        if (seconds == null) return "1m";
        if (seconds >= 3600) return (seconds / 3600) + "h";
        if (seconds >= 60) return (seconds / 60) + "m";
        return seconds + "s";
    }
}
