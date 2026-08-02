package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.adapter.out.persistence.EscalationPolicyRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.OnCallRotationRepository;
import com.astrawatch.orchestrator.domain.model.EscalationPolicy;
import com.astrawatch.orchestrator.domain.model.OnCallRotation;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Escalation policies (strategy gap 4 — the V6 migration created the table but
 * no code used it). A policy binds an org's incident flow to an on-call
 * rotation and a list of escalation steps, and can resolve who should be paged
 * at a given step.
 */
@Slf4j
@Service
public class EscalationPolicyService {

    private final EscalationPolicyRepository policyRepository;
    private final OnCallRotationRepository rotationRepository;
    private final OnCallService onCallService;
    private final ObjectMapper objectMapper;

    @Autowired
    public EscalationPolicyService(EscalationPolicyRepository policyRepository,
                                   OnCallRotationRepository rotationRepository,
                                   OnCallService onCallService,
                                   ObjectMapper objectMapper) {
        this.policyRepository = policyRepository;
        this.rotationRepository = rotationRepository;
        this.onCallService = onCallService;
        this.objectMapper = objectMapper;
    }

    public List<EscalationPolicy> listPolicies(UUID orgId) {
        return orgId != null
                ? policyRepository.findByOrgId(orgId)
                : policyRepository.findAll();
    }

    public EscalationPolicy createPolicy(EscalationPolicy policy) {
        return policyRepository.save(policy);
    }

    public Optional<EscalationPolicy> getPolicy(UUID id) {
        return policyRepository.findById(id);
    }

    public Optional<EscalationPolicy> updatePolicy(UUID id, Map<String, Object> body) {
        return policyRepository.findById(id).map(existing -> {
            if (body.get("name") != null) existing.setName(String.valueOf(body.get("name")));
            if (body.get("rotationId") != null) {
                try {
                    existing.setRotationId(UUID.fromString(String.valueOf(body.get("rotationId"))));
                } catch (Exception e) {
                    log.warn("Invalid rotationId, keeping existing: {}", e.getMessage());
                }
            }
            if (body.get("steps") != null) {
                try {
                    existing.setSteps(objectMapper.writeValueAsString(body.get("steps")));
                } catch (Exception e) {
                    log.warn("Invalid steps, keeping existing: {}", e.getMessage());
                }
            }
            if (body.get("enabled") != null) {
                existing.setEnabled(Boolean.parseBoolean(String.valueOf(body.get("enabled"))));
            }
            return policyRepository.save(existing);
        });
    }

    public void deletePolicy(UUID id) {
        policyRepository.deleteById(id);
    }

    /**
     * Resolves the paging target for a given escalation level: the rotation's
     * current on-call member, or the member from a target step. Returns an empty
     * map when the policy or rotation is not usable — callers fall back to the
     * incident's configured recipients.
     */
    public Map<String, Object> resolveStepTarget(UUID policyId, int level) {
        Optional<EscalationPolicy> opt = policyRepository.findById(policyId);
        if (opt.isEmpty() || !opt.get().isEnabled()) {
            return Map.of("resolved", false);
        }
        EscalationPolicy policy = opt.get();
        if (policy.getRotationId() == null) {
            return Map.of("resolved", false, "reason", "no rotation bound");
        }
        Optional<OnCallRotation> rotation = rotationRepository.findById(policy.getRotationId());
        if (rotation.isEmpty() || !rotation.get().isEnabled()) {
            return Map.of("resolved", false, "reason", "rotation missing or disabled");
        }
        UUID onCall = onCallService.currentOnCall(rotation.get(), null).orElse(null);
        return Map.of(
                "resolved", onCall != null,
                "policy", policy.getName(),
                "rotation", rotation.get().getName(),
                "level", level,
                "targetUserId", onCall != null ? onCall.toString() : null
        );
    }

    private List<Map<String, Object>> parseSteps(String steps) {
        if (steps == null || steps.isBlank()) return List.of();
        try {
            return objectMapper.readValue(steps, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception e) {
            log.warn("Failed to parse escalation steps: {}", e.getMessage());
            return List.of();
        }
    }
}
