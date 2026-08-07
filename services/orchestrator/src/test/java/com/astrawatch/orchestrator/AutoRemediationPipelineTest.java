package com.astrawatch.orchestrator;

import com.astrawatch.orchestrator.adapter.in.event.AnomalyEventConsumer;
import com.astrawatch.orchestrator.adapter.out.external.AnalyzerClient;
import com.astrawatch.orchestrator.adapter.out.kafka.KafkaEventProducer;
import com.astrawatch.orchestrator.adapter.out.persistence.GitHubIntegrationRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.GitHubRepositoryRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.HealingActionRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.application.port.out.NotificationRepository;
import com.astrawatch.orchestrator.application.service.GitHubIntegrationService;
import com.astrawatch.orchestrator.application.service.HealingOrchestrationService;
import com.astrawatch.orchestrator.application.service.IncidentCommandService;
import com.astrawatch.orchestrator.application.service.NotificationService;
import com.astrawatch.orchestrator.application.service.RiskScoringService;
import com.astrawatch.orchestrator.domain.model.GitHubIntegration;
import com.astrawatch.orchestrator.domain.model.GitHubRepository;
import com.astrawatch.orchestrator.domain.model.HealingAction;
import com.astrawatch.orchestrator.domain.model.Incident;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;
import org.mockito.ArgumentCaptor;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * In-process end-to-end test of the full auto-PR pipeline:
 *
 *   Kafka anomaly event → AnomalyEventConsumer creates incident
 *     → AnalyzerClient returns an evidence-backed suggestedFix
 *     → HealingOrchestrationService.processAutomatedRemediationIfEligible
 *     → GitHubIntegrationService.createRemediationPullRequest (GitHub REST mocked)
 *     → PR URL lands on the incident resolution note
 *     → sendAnomalyAlertEmail renders prUrl into the template context
 *
 * Covers both the happy path and the analyzer-down path (circuit-breaker
 * fallback → no aiDiagnosis → no patch → no placeholder PR).
 */
class AutoRemediationPipelineTest {

    private static final String PR_URL = "https://github.com/astrawatch-demo/backend-service/pull/42";

    private IncidentCommandService incidentService;
    private IncidentRepository incidentRepository;
    private GitHubIntegrationRepository integrationRepository;
    private GitHubRepositoryRepository gitHubRepositoryRepository;
    private HealingActionRepository healingActionRepository;
    private NotificationRepository notificationRepository;
    private RiskScoringService riskScoringService;
    private KafkaEventProducer kafkaEventProducer;
    private AnalyzerClient analyzerClient;
    private RestTemplate restTemplate;
    private TemplateEngine templateEngine;

    private ObjectMapper objectMapper;
    private NotificationService notificationService;
    private GitHubIntegrationService gitHubIntegrationService;
    private HealingOrchestrationService healingOrchestrationService;
    private AnomalyEventConsumer consumer;

    private UUID incidentId;
    private UUID serviceId;
    private Incident incident;
    /**
     * A separate "DB copy" returned by incidentRepository.findById — models the
     * real repository semantics where the GitHub service writes the resolution
     * note onto its own fetched entity and the consumer must re-read it. The
     * local {@link #incident} starts WITHOUT the PR note; it only gains it via
     * the consumer's post-PR re-read (incident.setResolutionNote(latest.getResolutionNote())).
     * This makes the test actually exercise the re-read path.
     */
    private Incident dbCopy;
    private String eventJson;

    @BeforeEach
    void setUp() throws Exception {
        objectMapper = new ObjectMapper();

        incidentService = mock(IncidentCommandService.class);
        incidentRepository = mock(IncidentRepository.class);
        integrationRepository = mock(GitHubIntegrationRepository.class);
        gitHubRepositoryRepository = mock(GitHubRepositoryRepository.class);
        healingActionRepository = mock(HealingActionRepository.class);
        notificationRepository = mock(NotificationRepository.class);
        riskScoringService = mock(RiskScoringService.class);
        kafkaEventProducer = mock(KafkaEventProducer.class);
        analyzerClient = mock(AnalyzerClient.class);
        restTemplate = mock(RestTemplate.class);
        templateEngine = mock(TemplateEngine.class);

        // Real services wired together — only external I/O is mocked.
        notificationService = new NotificationService(
                notificationRepository, Optional.empty(), Optional.of(templateEngine), null, incidentRepository);
        notificationService.ensureUnsubscribeSecret();

        gitHubIntegrationService = new GitHubIntegrationService(
                integrationRepository,
                gitHubRepositoryRepository,
                incidentRepository,
                healingActionRepository,
                incidentService,
                objectMapper,
                restTemplate);

        healingOrchestrationService = new HealingOrchestrationService(
                healingActionRepository,
                incidentRepository,
                riskScoringService,
                incidentService,
                notificationService,
                kafkaEventProducer,
                objectMapper,
                null, // redisTemplate — not configured, falls back to DB dedup
                gitHubIntegrationService,
                gitHubRepositoryRepository);

        consumer = new AnomalyEventConsumer(
                incidentService,
                incidentRepository,
                notificationService,
                objectMapper,
                null, // redisTemplate
                gitHubIntegrationService,
                gitHubRepositoryRepository,
                healingOrchestrationService,
                analyzerClient);

        // ── Fixture: a linked repo + integration for the affected service ──
        serviceId = UUID.randomUUID();
        incidentId = UUID.randomUUID();

        incident = Incident.builder()
                .id(incidentId)
                .serviceId(serviceId)
                .severity(Incident.Severity.CRITICAL)
                .title("Anomaly detected: " + serviceId)
                .description("Anomaly score: 0.93, affected metrics: latency")
                .build();

        // The repository returns a SEPARATE managed copy, not the consumer's local
        // instance — mirrors real JPA detached/managed semantics.
        dbCopy = Incident.builder()
                .id(incidentId)
                .serviceId(serviceId)
                .severity(Incident.Severity.CRITICAL)
                .title("Anomaly detected: " + serviceId)
                .description("Anomaly score: 0.93, affected metrics: latency")
                .build();

        GitHubIntegration integration = GitHubIntegration.builder()
                .id(UUID.randomUUID())
                .accessToken("ghp_real_token_12345")
                .build();

        GitHubRepository repo = GitHubRepository.builder()
                .id(UUID.randomUUID())
                .integrationId(integration.getId())
                .serviceId(serviceId)
                .repoOwner("astrawatch-demo")
                .repoName("backend-service")
                .defaultBranch("main")
                .build();

        when(incidentService.createIncident(any(), any(), any(), any(), any())).thenReturn(incident);
        // The consumer threads the event tenant through createIncident — stub the
        // 6-arg overload too so the pipeline exercises the real path.
        when(incidentService.createIncident(any(), any(), any(), any(), any(), anyString())).thenReturn(incident);
        when(incidentRepository.existsByAnomalyId(any())).thenReturn(false);
        when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(dbCopy));
        when(incidentRepository.save(any(Incident.class))).thenAnswer(inv -> inv.getArgument(0));
        when(gitHubRepositoryRepository.findByServiceId(serviceId)).thenReturn(Optional.of(repo));
        when(integrationRepository.findById(integration.getId())).thenReturn(Optional.of(integration));
        when(healingActionRepository.findByIncidentIdOrderByCreatedAtDesc(incidentId)).thenReturn(List.of());
        when(healingActionRepository.save(any(HealingAction.class))).thenAnswer(inv -> inv.getArgument(0));
        when(notificationRepository.findAllChannels()).thenReturn(List.of());

        // TemplateEngine renders a stub body — we assert on the captured Context
        // (prUrl variable), not the HTML. A non-null return avoids the retry loop
        // hitting a null htmlContent and keeps the tests fast.
        when(templateEngine.process(anyString(), any(Context.class))).thenReturn("<html>rendered</html>");

        // GitHub REST layer (all real calls, mocked at HTTP).
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(new ResponseEntity<>(Map.of("object", Map.of("sha", "abc123def")), HttpStatus.OK));
        when(restTemplate.exchange(anyString(), eq(HttpMethod.PUT), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(new ResponseEntity<>(Map.of(), HttpStatus.OK));
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(new ResponseEntity<>(Map.of("html_url", PR_URL), HttpStatus.CREATED));

        // Anomaly event JSON in the shape the Kafka topic carries.
        UUID anomalyUuid = UUID.randomUUID();
        Map<String, Object> event = Map.of(
                "eventId", anomalyUuid.toString(),
                "serviceId", serviceId.toString(),
                "tenantId", "tenant-1",
                "anomalyScore", 0.93,
                "affectedMetrics", List.of("latency"),
                "logEvidence", "{\"exceptionTypes\":[{\"type\":\"java.sql.SQLTimeoutException\",\"count\":14}]}"
        );
        eventJson = objectMapper.writeValueAsString(event);
    }

    // ── Happy path ────────────────────────────────────────────────────────

    @Test
    void testFullPipeline_OpensPRAndEmailCarriesTheLink() {
        // The analyzer returns a real evidence-backed suggestedFix.
        when(analyzerClient.getRootCause(anyString(), any(), any(), anyInt()))
                .thenReturn(reactor.core.publisher.Mono.just(Map.of(
                        "rankedCauses", List.of(Map.of("cause", "latency", "confidence", 0.92)),
                        "aiDiagnosis", Map.of(
                                "summary", "Latency spike driven by SQLTimeoutException.",
                                "what", "Deviation in latency.",
                                "why", "Log evidence points to SQLTimeoutException.",
                                "suggestedFix", Map.of(
                                        "targetFile", "astrawatch-remediation.md",
                                        "patch", "# AstraWatch Remediation\n\n- Diagnosis: latency spike.\n")
                        )
                )));

        consumer.consumeAnomalyEvent(eventJson);

        // 1. The PR URL lands on the incident resolution note.
        assertNotNull(incident.getResolutionNote(), "PR URL must be recorded on the incident");
        assertTrue(incident.getResolutionNote().contains(PR_URL),
                "resolutionNote should contain the PR URL but was: " + incident.getResolutionNote());

        // 2. A GITHUB_AUTOMATED_PR healing action was recorded.
        ArgumentCaptor<HealingAction> actionCaptor = ArgumentCaptor.forClass(HealingAction.class);
        verify(healingActionRepository).save(actionCaptor.capture());
        assertEquals("GITHUB_AUTOMATED_PR", actionCaptor.getValue().getActionType());
        assertTrue(actionCaptor.getValue().getParameters().contains(PR_URL));

        // 3. The incident timeline recorded github.pr_created.
        verify(incidentService).addEvent(eq(incidentId), eq("github.pr_created"), contains(PR_URL));

        // 4. The alert email template context carries the PR link.
        ArgumentCaptor<Context> contextCaptor = ArgumentCaptor.forClass(Context.class);
        verify(templateEngine).process(eq("email/anomaly-alert"), contextCaptor.capture());
        Context ctx = contextCaptor.getValue();
        assertEquals(PR_URL, ctx.getVariable("prUrl"));
        assertEquals(incidentId.toString(), ctx.getVariable("incidentId"));
    }

    @Test
    void testFullPipeline_IncidentIsSavedWithRootCauseAndLogEvidence() {
        when(analyzerClient.getRootCause(anyString(), any(), any(), anyInt()))
                .thenReturn(reactor.core.publisher.Mono.just(Map.of(
                        "rankedCauses", List.of(),
                        "aiDiagnosis", Map.of(
                                "summary", "Anomaly in latency.",
                                "what", "Deviation.",
                                "why", "Ensemble detector flagged it.",
                                "suggestedFix", Map.of(
                                        "targetFile", "astrawatch-remediation.md",
                                        "patch", "# AstraWatch Remediation\n")
                        )
                )));

        consumer.consumeAnomalyEvent(eventJson);

        assertTrue(incident.getRootCause() != null && incident.getRootCause().contains("latency"));
        assertTrue(incident.getDescription() != null && incident.getDescription().contains("Log evidence"));
        // The consumer's local incident must be persisted with root cause + log
        // evidence (capture the actual entity — not a bare call count).
        ArgumentCaptor<Incident> savedCaptor = ArgumentCaptor.forClass(Incident.class);
        verify(incidentRepository, atLeast(1)).save(savedCaptor.capture());
        boolean persistedWithDiagnosis = savedCaptor.getAllValues().stream()
                .anyMatch(i -> i.getRootCause() != null && i.getRootCause().contains("latency")
                        && i.getDescription() != null && i.getDescription().contains("Log evidence"));
        assertTrue(persistedWithDiagnosis, "An incident with root cause + log evidence must be persisted");
    }

    // ── Analyzer-down path ────────────────────────────────────────────────

    @Test
    void testAnalyzerDown_NoPatch_NoPlaceholderPR_NoEmailLink() {
        // Circuit-breaker fallback shape: rankedCauses only, NO aiDiagnosis.
        when(analyzerClient.getRootCause(anyString(), any(), any(), anyInt()))
                .thenReturn(reactor.core.publisher.Mono.just(Map.of("rankedCauses", List.of())));

        consumer.consumeAnomalyEvent(eventJson);

        // No placeholder PR: the GitHub REST /pulls endpoint must never be hit.
        verify(restTemplate, never()).postForEntity(contains("/pulls"), any(HttpEntity.class), eq(Map.class));

        // No GITHUB_AUTOMATED_PR action, no github.pr_created event.
        verify(healingActionRepository, never()).save(argThat(a ->
                a instanceof HealingAction && "GITHUB_AUTOMATED_PR".equals(((HealingAction) a).getActionType())));
        verify(incidentService, never()).addEvent(eq(incidentId), eq("github.pr_created"), anyString());

        // The email still fires, but the PR section is empty.
        ArgumentCaptor<Context> contextCaptor = ArgumentCaptor.forClass(Context.class);
        verify(templateEngine).process(eq("email/anomaly-alert"), contextCaptor.capture());
        assertEquals("", contextCaptor.getValue().getVariable("prUrl"));
        assertTrue(incident.getResolutionNote() == null || !incident.getResolutionNote().contains("GitHub PR:"));
    }

    @Test
    void testAnalyzerError_NoPatch_NoPR() {
        // Analyzer unreachable → consumer falls back to anomaly facts (no fix).
        when(analyzerClient.getRootCause(anyString(), any(), any(), anyInt()))
                .thenReturn(reactor.core.publisher.Mono.just(Map.of()));

        consumer.consumeAnomalyEvent(eventJson);

        verify(restTemplate, never()).postForEntity(contains("/pulls"), any(HttpEntity.class), eq(Map.class));
        verify(healingActionRepository, never()).save(argThat(a ->
                a instanceof HealingAction && "GITHUB_AUTOMATED_PR".equals(((HealingAction) a).getActionType())));
        // Incident still recorded with anomaly facts (never fabricated code).
        assertTrue(incident.getRootCause() != null && incident.getRootCause().contains("Anomaly score"));
    }
}
