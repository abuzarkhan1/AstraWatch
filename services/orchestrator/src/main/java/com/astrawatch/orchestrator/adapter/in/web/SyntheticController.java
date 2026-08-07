package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.out.persistence.SyntheticCheckRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.SyntheticCheckResultRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.domain.model.SyntheticCheck;
import com.astrawatch.orchestrator.domain.model.SyntheticCheckResult;
import com.astrawatch.orchestrator.domain.model.User;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Real synthetic checks CRUD (audit: createCheck fabricated a random id, GET
 * endpoints returned empty lists). Checks are persisted and listed; results are
 * honest — an empty array until a probe runner exists (no fabricated uptime).
 *
 * Org resolution is honest too (audit: this controller hardcoded the V3 mock
 * org UUID and invented a "last run = now" timestamp for never-run checks). The
 * org is now derived from the authenticated user's team; when the user has no
 * org context, reads return an empty list and writes fail with a clear 400 —
 * never a fabricated org id.
 */
@RestController
@RequestMapping("/api/v1/synthetics")
public class SyntheticController {

    private final SyntheticCheckRepository repository;
    private final SyntheticCheckResultRepository resultRepository;
    private final UserRepository userRepository;
    private final JdbcTemplate jdbcTemplate;

    public SyntheticController(SyntheticCheckRepository repository,
                               SyntheticCheckResultRepository resultRepository,
                               UserRepository userRepository,
                               JdbcTemplate jdbcTemplate) {
        this.repository = repository;
        this.resultRepository = resultRepository;
        this.userRepository = userRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/checks")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getChecks(@RequestParam(required = false) UUID orgId) {
        UUID org = orgId != null ? orgId : resolveOrgId();
        if (org == null) {
            // No org context for this user — honest empty state, no fabricated org.
            return ResponseEntity.ok(ApiResponse.ok(Map.of("checks", List.of())));
        }
        List<Map<String, Object>> checks = repository.findAllByOrgId(org).stream()
                .map(this::toMap)
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(Map.of("checks", checks)));
    }

    @PostMapping("/checks")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createCheck(@RequestBody Map<String, Object> body,
                                                                        @RequestParam(required = false) UUID orgId) {
        UUID org = orgId != null ? orgId : resolveOrgId();
        if (org == null) {
            return ResponseEntity.badRequest().body(new ApiResponse<>(
                    false, Map.of("error", "No organization context for this user — join a team before creating checks"), Map.of()));
        }
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
        check.setUptime(null);     // no probe data yet — honest
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
        // Real execution history written by SyntheticProbeRunner (most recent 50).
        List<Map<String, Object>> results = resultRepository.findTop50ByCheckIdOrderByCheckedAtDesc(id)
                .stream().map(this::resultToMap).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(Map.of("results", results)));
    }

    /**
     * Resolve the caller's org from their real team membership (user.team_id →
     * teams.org_id). Returns null when the user has no team/org — the caller is
     * then treated as having no org context instead of being assigned a
     * fabricated UUID.
     */
    private UUID resolveOrgId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getPrincipal() == null) return null;
        UUID userId = parseUuid(String.valueOf(auth.getPrincipal()));
        if (userId == null) return null;
        User user = userRepository.findById(userId).orElse(null);
        if (user == null || user.getTeamId() == null) return null;
        List<UUID> orgIds = jdbcTemplate.query(
                "SELECT org_id FROM teams WHERE id = ?",
                (rs, i) -> rs.getObject("org_id", UUID.class),
                user.getTeamId());
        return orgIds.isEmpty() ? null : orgIds.get(0);
    }

    private static UUID parseUuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private Map<String, Object> toMap(SyntheticCheck check) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", check.getId().toString());
        row.put("name", check.getName());
        row.put("type", check.getType());
        row.put("url", check.getUrl());
        row.put("interval", intervalLabel(check.getIntervalSeconds()));
        row.put("status", check.getStatus());
        // Honest values: null (not 0 / now) until a probe actually runs.
        row.put("responseTime", check.getResponseTimeMs() != null ? check.getResponseTimeMs() : null);
        row.put("uptime", check.getUptime() != null ? check.getUptime() : null);
        row.put("lastRun", check.getLastRunAt() != null ? check.getLastRunAt().toString() : null);
        return row;
    }

    private Map<String, Object> resultToMap(SyntheticCheckResult r) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", r.getId());
        row.put("status", r.getStatus());
        row.put("responseTime", r.getResponseTimeMs());
        row.put("error", r.getErrorMessage());
        row.put("timestamp", r.getCheckedAt() != null ? r.getCheckedAt().toString() : null);
        return row;
    }

    private String intervalLabel(Integer seconds) {
        if (seconds == null) return "1m";
        if (seconds >= 3600) return (seconds / 3600) + "h";
        if (seconds >= 60) return (seconds / 60) + "m";
        return seconds + "s";
    }
}
