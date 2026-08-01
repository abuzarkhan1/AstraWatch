package com.astrawatch.orchestrator.adapter.in.event;

import com.astrawatch.orchestrator.adapter.out.external.AnalyzerClient;
import com.astrawatch.orchestrator.adapter.out.persistence.GitHubRepositoryRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.application.service.GitHubIntegrationService;
import com.astrawatch.orchestrator.application.service.HealingOrchestrationService;
import com.astrawatch.orchestrator.application.service.IncidentCommandService;
import com.astrawatch.orchestrator.application.service.NotificationService;
import com.astrawatch.orchestrator.domain.event.AnomalyDetectedEvent;
import com.astrawatch.orchestrator.domain.model.Incident;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

@Component
public class AnomalyEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(AnomalyEventConsumer.class);

    private final IncidentCommandService incidentService;
    private final IncidentRepository incidentRepository;
    private final NotificationService notificationService;
    private final ObjectMapper objectMapper;
    private final StringRedisTemplate redisTemplate;
    private final GitHubIntegrationService gitHubIntegrationService;
    private final GitHubRepositoryRepository gitHubRepositoryRepository;
    private final HealingOrchestrationService healingOrchestrationService;
    private final AnalyzerClient analyzerClient;

    @Autowired
    public AnomalyEventConsumer(IncidentCommandService incidentService,
                                IncidentRepository incidentRepository,
                                NotificationService notificationService,
                                ObjectMapper objectMapper,
                                @Autowired(required = false) StringRedisTemplate redisTemplate,
                                @Autowired(required = false) GitHubIntegrationService gitHubIntegrationService,
                                @Autowired(required = false) GitHubRepositoryRepository gitHubRepositoryRepository,
                                @Autowired(required = false) HealingOrchestrationService healingOrchestrationService,
                                @Autowired(required = false) AnalyzerClient analyzerClient) {
        this.incidentService = incidentService;
        this.incidentRepository = incidentRepository;
        this.notificationService = notificationService;
        this.objectMapper = objectMapper;
        this.redisTemplate = redisTemplate;
        this.gitHubIntegrationService = gitHubIntegrationService;
        this.gitHubRepositoryRepository = gitHubRepositoryRepository;
        this.healingOrchestrationService = healingOrchestrationService;
        this.analyzerClient = analyzerClient;
    }

    @KafkaListener(topics = "anomaly-detected", groupId = "orchestrator-group")
    public void consumeAnomalyEvent(String message) {
        try {
            AnomalyDetectedEvent event = objectMapper.readValue(message, AnomalyDetectedEvent.class);
            log.info("Received anomaly event: rawEventId={}, serviceId={}, score={}",
                    event.getEventId(), event.getServiceId(), event.getAnomalyScore());

            UUID anomalyUuid = parseOrFallbackUUID(event.getEventId());

            // 1. Deduplication check via Redis
            if (redisTemplate != null) {
                try {
                    String redisKey = "astrawatch:dedup:event:" + anomalyUuid;
                    Boolean isFirstTime = redisTemplate.opsForValue().setIfAbsent(redisKey, "1", Duration.ofHours(24));
                    if (Boolean.FALSE.equals(isFirstTime)) {
                        log.warn("Duplicate anomaly event ignored (Redis hit): anomalyId={}", anomalyUuid);
                        return;
                    }
                } catch (Exception e) {
                    log.warn("Redis deduplication check failed, falling back to DB check: {}", e.getMessage());
                }
            }

            // 2. Deduplication check via DB
            if (incidentRepository.existsByAnomalyId(anomalyUuid)) {
                log.warn("Duplicate anomaly event ignored (DB hit): anomalyId={}", anomalyUuid);
                return;
            }

            Incident.Severity severity = event.getAnomalyScore() > 0.8
                    ? Incident.Severity.CRITICAL
                    : event.getAnomalyScore() > 0.6
                    ? Incident.Severity.HIGH
                    : Incident.Severity.MEDIUM;

            String metricsStr = (event.getAffectedMetrics() != null && event.getAffectedMetrics().length > 0)
                    ? String.join(", ", event.getAffectedMetrics())
                    : "latency";

            Incident incident = incidentService.createIncident(
                    event.getServiceId(),
                    anomalyUuid,
                    severity,
                    "Anomaly detected: " + event.getServiceId(),
                    String.format("Anomaly score: %.2f, affected metrics: %s",
                            event.getAnomalyScore(), metricsStr)
            );

            // Root-cause analysis: ask the analyzer for a real diagnosis. If it fails,
            // record the anomaly facts we do have — never fabricate an "AI Diagnosis" or
            // a code patch that does not exist.
            String aiAnalysis = String.format("Anomaly score %.2f for service %s (affected: %s).",
                    event.getAnomalyScore(), event.getServiceId(), metricsStr);
            String codePatch = null;
            try {
                if (analyzerClient != null) {
                    Map<String, Object> diagnosis = analyzerClient.getRootCause(
                            incident.getId().toString(), 900).block(Duration.ofSeconds(3));
                    if (diagnosis != null) {
                        Object diagObj = diagnosis.get("aiDiagnosis");
                        if (diagObj instanceof Map<?, ?> diagMap && diagMap.get("summary") != null) {
                            aiAnalysis = String.valueOf(diagMap.get("summary"));
                        }
                        Object causes = diagnosis.get("rankedCauses");
                        if (causes != null) {
                            aiAnalysis += " Root causes: " + causes;
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Analyzer root-cause unavailable for incident {}, using anomaly facts: {}", incident.getId(), e.getMessage());
            }

            incident.setRootCause(aiAnalysis);

            // Phase 3: persist the real mined log evidence (raw JSON) on the incident
            // so the UI and email carry the actual error content.
            if (event.getLogEvidence() != null && !event.getLogEvidence().isBlank()) {
                incident.setDescription((incident.getDescription() != null ? incident.getDescription() + "\n" : "")
                        + "Log evidence: " + event.getLogEvidence());
            }
            incidentRepository.save(incident);

            // Automated PR remediation is gated behind astrawatch.healing.auto-pr.enabled
            // (off by default) and strictly service-scoped — the audit found the previous
            // path fabricated code patches and could target the wrong repo. When disabled,
            // processAutomatedRemediationIfEligible logs a dry-run and returns false.
            // NOTE: codePatch is currently null (real solution generation is Phase 4), so
            // enabling auto-pr today writes a placeholder patch — keep the flag off until
            // the gated diagnosis→patch pipeline lands.
            if (healingOrchestrationService != null) {
                healingOrchestrationService.processAutomatedRemediationIfEligible(incident, aiAnalysis, codePatch);
            } else if (gitHubIntegrationService != null && gitHubRepositoryRepository != null) {
                boolean repoLinked = gitHubRepositoryRepository.findByServiceId(event.getServiceId()).isPresent();
                log.info("[DRY-RUN] Auto-remediation PR would have been created for incident {} (service {}, linkedRepo={}) — "
                                + "auto-PR disabled pending gated solution generation.",
                        incident.getId(), event.getServiceId(), repoLinked);
            }

            // Wire email notification trigger
            try {
                notificationService.sendAnomalyAlertEmail(incident);
            } catch (Exception e) {
                log.error("Failed to send anomaly alert email: {}", e.getMessage(), e);
            }

        } catch (Exception e) {
            log.error("Failed to process anomaly event: {}", e.getMessage(), e);
        }
    }

    public static UUID parseOrFallbackUUID(String eventIdStr) {
        if (eventIdStr == null || eventIdStr.isBlank()) {
            return UUID.randomUUID();
        }
        try {
            return UUID.fromString(eventIdStr);
        } catch (IllegalArgumentException e) {
            log.debug("Non-UUID eventId '{}' encountered, generating name-based UUID", eventIdStr);
            return UUID.nameUUIDFromBytes(eventIdStr.getBytes(StandardCharsets.UTF_8));
        }
    }
}
