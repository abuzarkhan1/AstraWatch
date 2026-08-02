package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.application.service.EscalationPolicyService;
import com.astrawatch.orchestrator.domain.model.EscalationPolicy;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Escalation policies (strategy gap 4 — previously dead schema). Persists
 * policies and resolves paging targets so incidents can escalate to the right
 * on-call member.
 */
@RestController
@RequestMapping("/api/v1/escalation")
@RequiredArgsConstructor
public class EscalationPolicyController {

    private final EscalationPolicyService policyService;

    @GetMapping("/policies")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getPolicies(@RequestParam(required = false) UUID orgId) {
        List<Map<String, Object>> policies = policyService.listPolicies(orgId).stream()
                .map(p -> Map.<String, Object>of(
                        "id", p.getId().toString(),
                        "name", p.getName(),
                        "orgId", p.getOrgId() != null ? p.getOrgId().toString() : "",
                        "rotationId", p.getRotationId() != null ? p.getRotationId().toString() : "",
                        "steps", p.getSteps(),
                        "enabled", p.isEnabled()
                ))
                .toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of("policies", policies)));
    }

    @PostMapping("/policies")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createPolicy(@RequestBody EscalationPolicy policy) {
        EscalationPolicy saved = policyService.createPolicy(policy);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(Map.<String, Object>of("id", saved.getId().toString(), "name", saved.getName())));
    }

    @PutMapping("/policies/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updatePolicy(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return policyService.updatePolicy(id, body)
                .map(p -> ResponseEntity.ok(ApiResponse.ok(Map.<String, Object>of("id", p.getId().toString(), "name", p.getName()))))
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/policies/{id}")
    public ResponseEntity<Void> deletePolicy(@PathVariable UUID id) {
        policyService.deletePolicy(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/policies/{id}/resolve")
    public ResponseEntity<ApiResponse<Map<String, Object>>> resolveStep(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "1") int level) {
        return ResponseEntity.ok(ApiResponse.ok(policyService.resolveStepTarget(id, level)));
    }
}
