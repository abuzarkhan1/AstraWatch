package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.domain.model.HealingAction;
import com.astrawatch.orchestrator.domain.model.Incident;
import com.astrawatch.orchestrator.adapter.out.persistence.HealingActionRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
public class HealingOrchestrationService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(HealingOrchestrationService.class);

    private final HealingActionRepository healingActionRepository;
    private final IncidentRepository incidentRepository;
    private final RiskScoringService riskScoringService;
    private final IncidentCommandService incidentCommandService;
    private final AuthService authService;
    private final ObjectMapper objectMapper;

    private static final int MAX_HEALING_ATTEMPTS_PER_INCIDENT = 3;
    private boolean healingEnabled = true;

    @Transactional
    public HealingAction triggerHealing(UUID incidentId, String actionType, Map<String, Object> parameters) {
        if (!healingEnabled) {
            throw new IllegalStateException("Auto-healing is globally disabled");
        }

        Incident incident = incidentRepository.findById(incidentId)
                .orElseThrow(() -> new IllegalArgumentException("Incident not found: " + incidentId));

        long attemptCount = healingActionRepository.findByIncidentIdOrderByCreatedAtDesc(incidentId).size();
        if (attemptCount >= MAX_HEALING_ATTEMPTS_PER_INCIDENT) {
            throw new IllegalStateException("Max healing attempts reached for incident: " + incidentId);
        }

        int riskScore = riskScoringService.calculateRiskScore(incident, actionType, parameters);

        String paramsJson;
        try {
            paramsJson = objectMapper.writeValueAsString(parameters);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize parameters", e);
        }

        HealingAction action = HealingAction.builder()
                .incidentId(incidentId)
                .actionType(actionType)
                .parameters(paramsJson)
                .riskScore(riskScore)
                .status(determineInitialStatus(riskScore))
                .build();

        action = healingActionRepository.save(action);

        incidentCommandService.addEvent(incidentId, "healing.triggered",
                String.format("{\"actionId\":\"%s\",\"actionType\":\"%s\",\"riskScore\":%d}",
                        action.getId(), actionType, riskScore));

        log.info("Healing triggered: actionId={}, incidentId={}, type={}, riskScore={}",
                action.getId(), incidentId, actionType, riskScore);

        return action;
    }

    private HealingAction.HealingStatus determineInitialStatus(int riskScore) {
        if (riskScore < 40) {
            return HealingAction.HealingStatus.APPROVED;
        } else if (riskScore <= 75) {
            return HealingAction.HealingStatus.PENDING;
        } else {
            return HealingAction.HealingStatus.PENDING;
        }
    }

    @Transactional
    public HealingAction approveAction(UUID actionId, UUID approvedBy) {
        HealingAction action = healingActionRepository.findById(actionId)
                .orElseThrow(() -> new IllegalArgumentException("Healing action not found: " + actionId));

        action.setApprovedBy(approvedBy);
        action.setStatus(HealingAction.HealingStatus.APPROVED);
        action = healingActionRepository.save(action);

        incidentCommandService.addEvent(action.getIncidentId(), "healing.approved",
                String.format("{\"actionId\":\"%s\",\"approvedBy\":\"%s\"}", actionId, approvedBy));

        return action;
    }

    @Transactional
    public HealingAction executeAction(UUID actionId) {
        HealingAction action = healingActionRepository.findById(actionId)
                .orElseThrow(() -> new IllegalArgumentException("Healing action not found: " + actionId));

        if (action.getStatus() != HealingAction.HealingStatus.APPROVED) {
            throw new IllegalStateException("Action must be approved before execution: " + actionId);
        }

        action.setStatus(HealingAction.HealingStatus.EXECUTING);
        action = healingActionRepository.save(action);

        incidentCommandService.addEvent(action.getIncidentId(), "healing.started",
                String.format("{\"actionId\":\"%s\"}", actionId));

        try {
            java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
            String payload = String.format("{\"actionId\":\"%s\", \"actionType\":\"%s\", \"parameters\":%s}", 
                actionId, action.getActionType(), action.getParameters());
            
            String serviceToken = authService.generateServiceToken("orchestrator");
            java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                .uri(java.net.URI.create("http://operator:8080/api/v1/healing/trigger"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + serviceToken)
                .header("Idempotency-Key", "heal-" + actionId.toString())
                .POST(java.net.http.HttpRequest.BodyPublishers.ofString(payload))
                .build();
                
            client.sendAsync(request, java.net.http.HttpResponse.BodyHandlers.ofString())
                .thenAccept(response -> {
                    if (response.statusCode() >= 400) {
                        log.error("Operator returned error: {}", response.body());
                    }
                });
        } catch (Exception e) {
            log.error("Failed to trigger operator", e);
        }

        return action;
    }

    @Transactional
    public HealingAction completeAction(UUID actionId, boolean success, Map<String, Object> afterMetrics) {
        HealingAction action = healingActionRepository.findById(actionId)
                .orElseThrow(() -> new IllegalArgumentException("Healing action not found: " + actionId));

        if (success) {
            action.setStatus(HealingAction.HealingStatus.COMPLETED);
            incidentCommandService.updateState(action.getIncidentId(), Incident.IncidentState.RESOLVED);
        } else {
            action.setStatus(HealingAction.HealingStatus.FAILED);
            incidentCommandService.updateState(action.getIncidentId(), Incident.IncidentState.ESCALATED);
        }

        try {
            action.setAfterMetrics(objectMapper.writeValueAsString(afterMetrics));
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize after-metrics", e);
        }

        action.setCompletedAt(Instant.now());
        action = healingActionRepository.save(action);

        incidentCommandService.addEvent(action.getIncidentId(),
                success ? "healing.completed" : "healing.failed",
                String.format("{\"actionId\":\"%s\",\"success\":%b}", actionId, success));

        return action;
    }

    @Transactional
    public HealingAction rollbackAction(UUID actionId, String reason) {
        HealingAction action = healingActionRepository.findById(actionId)
                .orElseThrow(() -> new IllegalArgumentException("Healing action not found: " + actionId));

        action.setStatus(HealingAction.HealingStatus.ROLLED_BACK);
        action.setCompletedAt(Instant.now());
        action = healingActionRepository.save(action);

        incidentCommandService.updateState(action.getIncidentId(), Incident.IncidentState.ROLLED_BACK);
        incidentCommandService.addEvent(action.getIncidentId(), "healing.rolled_back",
                String.format("{\"actionId\":\"%s\",\"reason\":\"%s\"}", actionId, reason));

        return action;
    }

    public void setHealingEnabled(boolean enabled) {
        this.healingEnabled = enabled;
        log.info("Auto-healing globally {}", enabled ? "enabled" : "disabled");
    }

    public boolean isHealingEnabled() {
        return healingEnabled;
    }
}
