package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.adapter.out.kafka.KafkaEventProducer;
import com.astrawatch.orchestrator.adapter.out.persistence.GitHubRepositoryRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.HealingActionRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.domain.model.HealingAction;
import com.astrawatch.orchestrator.domain.model.Incident;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
public class HealingOrchestrationService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(HealingOrchestrationService.class);
    private static final String REDIS_HEALING_ENABLED_KEY = "astrawatch:healing:enabled";
    private static final int MAX_HEALING_ATTEMPTS_PER_INCIDENT = 3;

    private final HealingActionRepository healingActionRepository;
    private final IncidentRepository incidentRepository;
    private final RiskScoringService riskScoringService;
    private final IncidentCommandService incidentCommandService;
    private final NotificationService notificationService;
    private final KafkaEventProducer kafkaEventProducer;
    private final ObjectMapper objectMapper;
    private final StringRedisTemplate redisTemplate;
    private final GitHubIntegrationService gitHubIntegrationService;
    private final GitHubRepositoryRepository gitHubRepositoryRepository;

    private boolean healingEnabled = true;

    // Gated auto-PR remediation. When enabled, an incident whose service has a
    // strictly-scoped linked repo may generate a remediation PR (audit F4
    // boundary: never any-repo fallback, never mock tokens). Enabled by default
    // since Phase 4 landed real evidence-backed patches from the analyzer — the
    // flag can be turned off with ASTRAWATCH_AUTO_PR_ENABLED=false.
    @Value("${astrawatch.healing.auto-pr.enabled:true}")
    private boolean autoPREnabled = true;

    @Autowired
    public HealingOrchestrationService(HealingActionRepository healingActionRepository,
                                       IncidentRepository incidentRepository,
                                       RiskScoringService riskScoringService,
                                       IncidentCommandService incidentCommandService,
                                       NotificationService notificationService,
                                       KafkaEventProducer kafkaEventProducer,
                                       ObjectMapper objectMapper,
                                       @Autowired(required = false) StringRedisTemplate redisTemplate,
                                       @Autowired(required = false) GitHubIntegrationService gitHubIntegrationService,
                                       @Autowired(required = false) GitHubRepositoryRepository gitHubRepositoryRepository) {
        this.healingActionRepository = healingActionRepository;
        this.incidentRepository = incidentRepository;
        this.riskScoringService = riskScoringService;
        this.incidentCommandService = incidentCommandService;
        this.notificationService = notificationService;
        this.kafkaEventProducer = kafkaEventProducer;
        this.objectMapper = objectMapper;
        this.redisTemplate = redisTemplate;
        this.gitHubIntegrationService = gitHubIntegrationService;
        this.gitHubRepositoryRepository = gitHubRepositoryRepository;
    }

    @Transactional
    public HealingAction triggerHealing(UUID incidentId, String actionType, Map<String, Object> parameters) {
        if (!isHealingEnabled()) {
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

        HealingAction.HealingStatus initialStatus = determineInitialStatus(riskScore);

        HealingAction action = HealingAction.builder()
                .incidentId(incidentId)
                .actionType(actionType)
                .parameters(paramsJson)
                .riskScore(riskScore)
                .status(initialStatus)
                .build();

        action = healingActionRepository.save(action);

        incidentCommandService.addEvent(incidentId, "healing.triggered",
                String.format("{\"actionId\":\"%s\",\"actionType\":\"%s\",\"riskScore\":%d,\"status\":\"%s\"}",
                        action.getId(), actionType, riskScore, initialStatus));

        log.info("Healing triggered: actionId={}, incidentId={}, type={}, riskScore={}, status={}",
                action.getId(), incidentId, actionType, riskScore, initialStatus);

        // Publish healing-triggered to Kafka (audit: the realtime gateway maps
        // this topic to healing.started but no producer existed — the UI's
        // "healing started" toast never fired). Tenant default matches the
        // anomaly-detected convention so the browser room receives it.
        try {
            Map<String, Object> healingEvent = new LinkedHashMap<>();
            healingEvent.put("incidentId", incidentId.toString());
            healingEvent.put("actionId", action.getId().toString());
            healingEvent.put("actionType", actionType);
            healingEvent.put("riskScore", riskScore);
            healingEvent.put("status", initialStatus.name());
            healingEvent.put("serviceId", incident.getServiceId() != null ? incident.getServiceId().toString() : null);
            healingEvent.put("tenantId", "default");
            kafkaEventProducer.publish("healing-triggered", action.getId().toString(), healingEvent);
        } catch (Exception e) {
            log.error("Failed to publish healing-triggered event: {}", e.getMessage());
        }

        try {
            notificationService.sendHealingStatusEmail(action, initialStatus.name());
        } catch (Exception e) {
            log.error("Failed to send healing triggered email: {}", e.getMessage());
        }

        return action;
    }

    private HealingAction.HealingStatus determineInitialStatus(int riskScore) {
        if (riskScore < 40) {
            log.info("Low risk score ({}), auto-approving healing action", riskScore);
            return HealingAction.HealingStatus.APPROVED;
        } else if (riskScore <= 75) {
            log.info("Medium risk score ({}), requiring human approval (PENDING)", riskScore);
            return HealingAction.HealingStatus.PENDING;
        } else {
            log.warn("HIGH risk score ({}), explicitly requiring PENDING human approval", riskScore);
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

        try {
            notificationService.sendHealingStatusEmail(action, "APPROVED");
        } catch (Exception e) {
            log.error("Failed to send healing approved email: {}", e.getMessage());
        }

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
                String.format("{\"actionId\":\"%s\",\"actionType\":\"%s\"}", actionId, action.getActionType()));

        try {
            Map<String, Object> eventPayload = new HashMap<>();
            eventPayload.put("actionId", actionId.toString());
            eventPayload.put("incidentId", action.getIncidentId().toString());
            eventPayload.put("actionType", action.getActionType());
            eventPayload.put("parameters", action.getParameters());
            eventPayload.put("riskScore", action.getRiskScore());
            eventPayload.put("timestamp", Instant.now().toString());

            kafkaEventProducer.publish("healing-actions", actionId.toString(), eventPayload);

            log.info("Published healing action to Kafka topic 'healing-actions': actionId={}", actionId);
        } catch (Exception e) {
            log.error("Failed to publish healing action event for actionId={}: {}", actionId, e.getMessage(), e);
            action.setStatus(HealingAction.HealingStatus.FAILED);
            healingActionRepository.save(action);
            incidentCommandService.addEvent(action.getIncidentId(), "healing.failed",
                    String.format("{\"actionId\":\"%s\",\"error\":\"%s\"}", actionId, e.getMessage()));
        }

        try {
            notificationService.sendHealingStatusEmail(action, "EXECUTING");
        } catch (Exception e) {
            log.error("Failed to send healing executing email: {}", e.getMessage());
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

        try {
            notificationService.sendHealingStatusEmail(action, success ? "COMPLETED" : "FAILED");
        } catch (Exception e) {
            log.error("Failed to send healing completion email: {}", e.getMessage());
        }

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

        try {
            notificationService.sendHealingStatusEmail(action, "ROLLED_BACK");
        } catch (Exception e) {
            log.error("Failed to send healing rollback email: {}", e.getMessage());
        }

        return action;
    }

    @Transactional
    public HealingAction rejectAction(UUID actionId, UUID rejectedBy, String reason) {
        HealingAction action = healingActionRepository.findById(actionId)
                .orElseThrow(() -> new IllegalArgumentException("Healing action not found: " + actionId));

        // A rejected action must not be executed; mark it FAILED so the incident
        // stays open for human investigation (no auto-resolution).
        action.setStatus(HealingAction.HealingStatus.FAILED);
        action.setApprovedBy(rejectedBy);
        action.setCompletedAt(Instant.now());
        action = healingActionRepository.save(action);

        incidentCommandService.addEvent(action.getIncidentId(), "healing.rejected",
                String.format("{\"actionId\":\"%s\",\"rejectedBy\":\"%s\",\"reason\":\"%s\"}",
                        actionId, rejectedBy != null ? rejectedBy : "email", reason));

        try {
            notificationService.sendHealingStatusEmail(action, "REJECTED");
        } catch (Exception e) {
            log.error("Failed to send healing rejected email: {}", e.getMessage());
        }

        return action;
    }

    @Transactional
    public boolean processAutomatedRemediationIfEligible(Incident incident, String aiAnalysis, String codePatch) {
        if (!autoPREnabled) {
            log.info("[DRY-RUN] Auto-remediation PR disabled (astrawatch.healing.auto-pr.enabled=false) for incident {}",
                    incident == null ? "null" : incident.getId());
            return false;
        }
        if (incident == null || incident.getServiceId() == null) {
            return false;
        }
        // Never open a placeholder PR: the analyzer's evidence-backed patch is the
        // ONLY content we will commit. When it is absent (analyzer down / circuit
        // breaker fallback / no suggestedFix), no PR is created — the audit
        // explicitly forbade fabricated "// AstraWatch Fix Patch" commits.
        if (codePatch == null || codePatch.isBlank()) {
            log.info("[SKIP] No evidence-backed patch from analyzer for incident {} — "
                            + "refusing to open a placeholder remediation PR.",
                    incident.getId());
            return false;
        }
        // Strict service scoping: never fall back to "any repo in the system" — that
        // could attribute a remediation to an unrelated tenant's repository (audit F4).
        boolean hasLinkedRepo = gitHubRepositoryRepository != null
                && gitHubRepositoryRepository.findByServiceId(incident.getServiceId()).isPresent();

        if (!hasLinkedRepo) {
            return false;
        }

        if (gitHubIntegrationService == null) {
            return false;
        }
        try {
            log.info("Linked GitHub repository found for serviceId={}, creating remediation PR", incident.getServiceId());
            String prUrl = gitHubIntegrationService.createRemediationPullRequest(incident.getId(), aiAnalysis, codePatch);
            log.info("Automated PR created successfully: {}", prUrl);
            return true;
        } catch (Exception e) {
            log.error("Failed to automatically create remediation PR for incidentId={}: {}", incident.getId(), e.getMessage(), e);
        }
        return false;
    }

    public void setHealingEnabled(boolean enabled) {
        this.healingEnabled = enabled;
        try {
            if (redisTemplate != null) {
                redisTemplate.opsForValue().set(REDIS_HEALING_ENABLED_KEY, String.valueOf(enabled));
            }
        } catch (Exception e) {
            log.warn("Could not persist healingEnabled to Redis: {}", e.getMessage());
        }
        log.info("Auto-healing globally {}", enabled ? "enabled" : "disabled");
    }

    public boolean isHealingEnabled() {
        try {
            if (redisTemplate != null) {
                String val = redisTemplate.opsForValue().get(REDIS_HEALING_ENABLED_KEY);
                if (val != null) {
                    this.healingEnabled = Boolean.parseBoolean(val);
                }
            }
        } catch (Exception e) {
            log.warn("Could not read healingEnabled from Redis, fallback to in-memory: {}", e.getMessage());
        }
        return healingEnabled;
    }
}
