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
import org.springframework.jdbc.core.JdbcTemplate;
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
    private final JdbcTemplate jdbcTemplate;
    private final GitHubIntegrationService gitHubIntegrationService;
    private final GitHubRepositoryRepository gitHubRepositoryRepository;
    private final HealingOrchestrationService healingOrchestrationService;
    private final AnalyzerClient analyzerClient;

    // Backward-compatible constructor kept for unit tests that predate the
    // JdbcTemplate wiring (review fix: adding a constructor arg broke the
    // existing AnomalyEventConsumerTest/AutoRemediationPipelineTest setUp).
    public AnomalyEventConsumer(IncidentCommandService incidentService,
                                IncidentRepository incidentRepository,
                                NotificationService notificationService,
                                ObjectMapper objectMapper,
                                StringRedisTemplate redisTemplate,
                                GitHubIntegrationService gitHubIntegrationService,
                                GitHubRepositoryRepository gitHubRepositoryRepository,
                                HealingOrchestrationService healingOrchestrationService,
                                AnalyzerClient analyzerClient) {
        this(incidentService, incidentRepository, notificationService, objectMapper,
                redisTemplate, gitHubIntegrationService, gitHubRepositoryRepository,
                healingOrchestrationService, analyzerClient, null);
    }

    @Autowired
    public AnomalyEventConsumer(IncidentCommandService incidentService,
                                IncidentRepository incidentRepository,
                                NotificationService notificationService,
                                ObjectMapper objectMapper,
                                @Autowired(required = false) StringRedisTemplate redisTemplate,
                                @Autowired(required = false) GitHubIntegrationService gitHubIntegrationService,
                                @Autowired(required = false) GitHubRepositoryRepository gitHubRepositoryRepository,
                                @Autowired(required = false) HealingOrchestrationService healingOrchestrationService,
                                @Autowired(required = false) AnalyzerClient analyzerClient,
                                @Autowired(required = false) JdbcTemplate jdbcTemplate) {
        this.incidentService = incidentService;
        this.incidentRepository = incidentRepository;
        this.notificationService = notificationService;
        this.objectMapper = objectMapper;
        this.redisTemplate = redisTemplate;
        this.gitHubIntegrationService = gitHubIntegrationService;
        this.gitHubRepositoryRepository = gitHubRepositoryRepository;
        this.healingOrchestrationService = healingOrchestrationService;
        this.analyzerClient = analyzerClient;
        this.jdbcTemplate = jdbcTemplate;
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

            // The catalog id is a string ("payment-api"); resolve it to the
            // registered service UUID when one exists, otherwise leave null (the
            // column is nullable) — the title keeps the readable service name.
            UUID serviceUuid = resolveServiceUuid(event.getServiceId());
            // The analyzer carries the tenant id on every anomaly event — thread it
            // through so the incident and its Kafka pushes land in the right tenant
            // room (audit: incidents defaulted to "default" tenant).
            String tenantId = event.getTenantId() != null && !event.getTenantId().isBlank()
                    ? event.getTenantId() : "default";
            Incident incident = incidentService.createIncident(
                    serviceUuid,
                    anomalyUuid,
                    severity,
                    "Anomaly detected: " + event.getServiceId(),
                    String.format("Anomaly score: %.2f, affected metrics: %s",
                            event.getAnomalyScore(), metricsStr),
                    tenantId
            );

            // Root-cause analysis: ask the analyzer for a real diagnosis. If it fails,
            // record the anomaly facts we do have — never fabricate an "AI Diagnosis" or
            // a code patch that does not exist.
            String aiAnalysis = String.format("Anomaly score %.2f for service %s (affected: %s).",
                    event.getAnomalyScore(), event.getServiceId(), metricsStr);
            String codePatch = null;
            try {
                if (analyzerClient != null) {
                    // Forward the real serviceId (and tenantId when present) so the
                    // analyzer mines log evidence for the actual service — the auto-PR
                    // remediation document depends on it (audit review finding).
                    Map<String, Object> diagnosis = analyzerClient.getRootCause(
                            incident.getId().toString(),
                            event.getServiceId(),
                            event.getTenantId(),
                            900).block(Duration.ofSeconds(3));
                    if (diagnosis != null) {
                        Object diagObj = diagnosis.get("aiDiagnosis");
                        if (diagObj instanceof Map<?, ?> diagMap && diagMap.get("summary") != null) {
                            aiAnalysis = String.valueOf(diagMap.get("summary"));
                        }
                        Object causes = diagnosis.get("rankedCauses");
                        if (causes != null) {
                            aiAnalysis += " Root causes: " + causes;
                        }
                        // Phase 4: the analyzer returns a real evidence-backed
                        // suggestedFix (targetFile + patch). Build the codePatch
                        // string in the "File: <path>\n<content>" shape the GitHub
                        // PR writer parses. When the analyzer has no fix, codePatch
                        // stays null and no PR is created (never a placeholder).
                        if (diagObj instanceof Map<?, ?> diagMap) {
                            Object fixObj = diagMap.get("suggestedFix");
                            if (fixObj instanceof Map<?, ?> fixMap) {
                                Object targetFile = fixMap.get("targetFile");
                                Object patch = fixMap.get("patch");
                                if (targetFile != null && patch != null
                                        && !String.valueOf(patch).isBlank()) {
                                    codePatch = "File: " + targetFile + "\n" + patch;
                                }
                            }
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

            // Automated PR remediation (Phase 4): when a service has a strictly-scoped
            // linked GitHub repo, the analyzer's evidence-backed suggestedFix is opened
            // as a PR on that same repo. Gated by astrawatch.healing.auto-pr.enabled
            // (default true). When codePatch is null (analyzer down / no suggestedFix),
            // processAutomatedRemediationIfEligible refuses to open a placeholder PR.
            if (healingOrchestrationService != null) {
                healingOrchestrationService.processAutomatedRemediationIfEligible(incident, aiAnalysis, codePatch);
            } else if (gitHubIntegrationService != null && gitHubRepositoryRepository != null) {
                // The catalog id is a string; resolve to the services-table UUID for
                // the linked-repo lookup (review fix).
                UUID resolved = resolveServiceUuid(event.getServiceId());
                boolean repoLinked = resolved != null
                        && gitHubRepositoryRepository.findByServiceId(resolved).isPresent();
                log.info("[DRY-RUN] Auto-remediation PR would have been created for incident {} (service {}, linkedRepo={}) — "
                                + "auto-PR service unavailable.",
                        incident.getId(), event.getServiceId(), repoLinked);
            }

            // createRemediationPullRequest persists the PR URL on its own fetched
            // incident instance — re-read ours so the alert email carries the link.
            Incident latest = incidentRepository.findById(incident.getId()).orElse(incident);
            incident.setResolutionNote(latest.getResolutionNote());

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

    // Resolve a catalog service name to its registered service UUID (the
    // services table is seeded by the workspace provisioner). Honest null
    // when no service row matches — never a fabricated UUID.
    private UUID resolveServiceUuid(String serviceName) {
        if (serviceName == null || serviceName.isBlank() || jdbcTemplate == null) return null;
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT id FROM services WHERE name = ? LIMIT 1",
                    UUID.class, serviceName);
        } catch (Exception e) {
            return null;
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
