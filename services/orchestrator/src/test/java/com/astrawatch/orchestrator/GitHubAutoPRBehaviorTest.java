package com.astrawatch.orchestrator;

import com.astrawatch.orchestrator.adapter.out.persistence.GitHubIntegrationRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.GitHubRepositoryRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.HealingActionRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.application.service.GitHubIntegrationService;
import com.astrawatch.orchestrator.application.service.IncidentCommandService;
import com.astrawatch.orchestrator.domain.model.GitHubIntegration;
import com.astrawatch.orchestrator.domain.model.GitHubRepository;
import com.astrawatch.orchestrator.domain.model.HealingAction;
import com.astrawatch.orchestrator.domain.model.Incident;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * BEHAVIOR verification (not compile-check): drives the real
 * GitHubIntegrationService against an in-process HTTP stub so the actual REST
 * sequence (git/refs, contents, pulls) executes over real sockets. Proves the
 * three adversarial-review fixes behave — bounded timeouts, idempotent retries,
 * and duplicate-PR recovery — plus the header-strip and incident recording.
 */
public class GitHubAutoPRBehaviorTest {

    private HttpServer server;
    private GitHubIntegrationService service;

    private GitHubIntegrationRepository integrationRepository;
    private GitHubRepositoryRepository repositoryRepository;
    private IncidentRepository incidentRepository;
    private HealingActionRepository healingActionRepository;
    private IncidentCommandService incidentCommandService;

    private final AtomicInteger refGetHits = new AtomicInteger();
    private final AtomicInteger branchPostHits = new AtomicInteger();
    private final AtomicInteger contentsPutHits = new AtomicInteger();
    private final AtomicInteger pullsPostHits = new AtomicInteger();
    private final AtomicInteger pullsGetHits = new AtomicInteger();

    private String committedContent;
    private String recoveryQuery;
    private volatile UUID incidentId;
    private volatile UUID serviceId;
    private volatile UUID integrationId;
    private volatile Incident incident;

    @BeforeEach
    public void setUp() throws IOException {
        incidentId = UUID.randomUUID();
        serviceId = UUID.randomUUID();
        integrationId = UUID.randomUUID();

        incident = Incident.builder()
                .id(incidentId)
                .serviceId(serviceId)
                .severity(Incident.Severity.HIGH)
                .title("Database Latency Spike")
                .description("Latencies exceeded 5000ms threshold")
                .build();

        GitHubIntegration integration = GitHubIntegration.builder()
                .id(integrationId)
                .accessToken("ghp_test12345")
                .build();

        GitHubRepository repo = GitHubRepository.builder()
                .id(UUID.randomUUID())
                .integrationId(integrationId)
                .serviceId(serviceId)
                .repoOwner("acme")
                .repoName("demo")
                .defaultBranch("main")
                .build();

        integrationRepository = mock(GitHubIntegrationRepository.class);
        repositoryRepository = mock(GitHubRepositoryRepository.class);
        incidentRepository = mock(IncidentRepository.class);
        healingActionRepository = mock(HealingActionRepository.class);
        incidentCommandService = mock(IncidentCommandService.class);

        when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
        when(repositoryRepository.findByServiceId(serviceId)).thenReturn(Optional.of(repo));
        when(integrationRepository.findById(integrationId)).thenReturn(Optional.of(integration));
        when(healingActionRepository.findByIncidentIdOrderByCreatedAtDesc(incidentId)).thenReturn(List.of());

        service = new GitHubIntegrationService(
                integrationRepository, repositoryRepository, incidentRepository,
                healingActionRepository, incidentCommandService, new ObjectMapper(),
                new RestTemplate());

        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.start();
    }

    @AfterEach
    public void tearDown() {
        if (server != null) server.stop(0);
    }

    /**
     * Full lifecycle over REAL HTTP: ref GET → branch POST (422 already exists,
     * treated as idempotent success) → contents GET (404) → contents PUT (content
     * must have the File: header stripped) → pulls POST (422 duplicate) → recovery
     * GET (finds the existing PR) → the recovered URL is returned and recorded on
     * the incident, timeline, and healing action.
     */
    @Test
    public void fullLifecycle_RealHttp_RecoversExistingPrAndRecordsIncident() throws Exception {
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            String method = exchange.getRequestMethod();
            try {
                if (method.equals("GET") && path.endsWith("/git/ref/heads/main")) {
                    refGetHits.incrementAndGet();
                    respond(exchange, 200, "{\"object\":{\"sha\":\"beef1234\"}}");
                } else if (method.equals("POST") && path.endsWith("/git/refs")) {
                    branchPostHits.incrementAndGet();
                    // Retry scenario: the remediation branch already exists.
                    respond(exchange, 422, "{\"message\":\"Reference already exists\"}");
                } else if (method.equals("GET") && path.contains("/contents/")) {
                    respond(exchange, 404, "{\"message\":\"Not Found\"}");
                } else if (method.equals("PUT") && path.contains("/contents/")) {
                    contentsPutHits.incrementAndGet();
                    String reqBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                    String content = new String(Base64.getDecoder().decode(
                            (String) ((Map) new ObjectMapper().readValue(reqBody, Map.class)).get("content")),
                            StandardCharsets.UTF_8);
                    committedContent = content;
                    respond(exchange, 201, "{\"content\":{\"sha\":\"deadbeef\"}}");
                } else if (method.equals("POST") && path.endsWith("/pulls")) {
                    pullsPostHits.incrementAndGet();
                    // The PR already exists from a prior attempt.
                    respond(exchange, 422, "{\"message\":\"A pull request already exists for these branches\"}");
                } else if (method.equals("GET") && path.contains("/pulls")) {
                    pullsGetHits.incrementAndGet();
                    recoveryQuery = exchange.getRequestURI().getQuery();
                    respond(exchange, 200, "[{\"html_url\":\"https://github.com/acme/demo/pull/99\"}]");
                } else {
                    respond(exchange, 404, "{\"message\":\"unexpected " + method + " " + path + "\"}");
                }
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        service.setGitHubApiBase("http://127.0.0.1:" + server.getAddress().getPort());

        String patch = "# AstraWatch Remediation\n\n- Diagnosis: latency spike.\n- What: deviation.\n- Why: causal lead.\n";
        String prUrl = service.createRemediationPullRequest(
                incidentId, "AI diagnosis summary", "File: astrawatch-remediation.md\n" + patch);

        // The real HTTP sequence actually executed, in order:
        assertEquals("https://github.com/acme/demo/pull/99", prUrl);
        assertEquals(1, refGetHits.get(), "base ref must be resolved once");
        assertEquals(1, branchPostHits.get(), "branch POST must be attempted once (422 already-exists is success)");
        assertEquals(1, contentsPutHits.get(), "patch must be committed once");
        assertEquals(1, pullsPostHits.get(), "PR POST must be attempted once (422 duplicate)");
        assertEquals(1, pullsGetHits.get(), "recovery lookup must run to recover the existing PR");

        // The committed content is the real remediation doc WITHOUT the File: header line.
        assertNotNull(committedContent, "contents PUT body must have been captured");
        assertFalse(committedContent.startsWith("File: "), "committed content must not carry the File: header");
        assertTrue(committedContent.contains("AstraWatch Remediation"), "committed content must be the real remediation doc");

        // The recovery lookup targeted the remediation branch on the right repo.
        assertNotNull(recoveryQuery);
        assertTrue(recoveryQuery.contains("head=acme:astrawatch/fix-incident-"),
                "recovery lookup must target the remediation branch, was: " + recoveryQuery);

        // The recovered PR URL lands on the incident, timeline, and healing action.
        ArgumentCaptor<Incident> incCap = ArgumentCaptor.forClass(Incident.class);
        verify(incidentRepository).save(incCap.capture());
        assertNotNull(incCap.getValue().getResolutionNote());
        assertTrue(incCap.getValue().getResolutionNote().contains("github.com/acme/demo/pull/99"));

        verify(incidentCommandService).addEvent(eq(incidentId), eq("github.pr_created"), contains("pull/99"));

        ArgumentCaptor<HealingAction> actCap = ArgumentCaptor.forClass(HealingAction.class);
        verify(healingActionRepository).save(actCap.capture());
        assertEquals(HealingAction.HealingStatus.EXECUTING, actCap.getValue().getStatus());
        assertEquals("GITHUB_AUTOMATED_PR", actCap.getValue().getActionType());
        assertTrue(actCap.getValue().getParameters().contains("pull/99"));
    }

    /**
     * A GitHub endpoint that accepts the connection but never responds is exactly
     * the hang the old infinite-timeout RestTemplate would block on forever. With
     * bounded timeouts the call must fail loudly within ~1s and record NOTHING.
     */
    @Test
    public void hungGithubEndpoint_FailsLoudlyInBoundedTime_NothingFabricated() throws Exception {
        server.createContext("/", exchange -> {
            try {
                // Outlast the client's 1s read timeout by a comfortable margin; the
                // JVM lingers until this thread wakes, so keep it short (3s).
                Thread.sleep(3_000);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            try { respond(exchange, 500, "{}"); } catch (IOException ignored) { /* connection already closed */ }
        });

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(1_000);
        factory.setReadTimeout(1_000);
        service = new GitHubIntegrationService(
                integrationRepository, repositoryRepository, incidentRepository,
                healingActionRepository, incidentCommandService, new ObjectMapper(),
                new RestTemplate(factory));
        service.setGitHubApiBase("http://127.0.0.1:" + server.getAddress().getPort());

        long start = System.currentTimeMillis();
        assertThrows(IllegalStateException.class, () ->
                service.createRemediationPullRequest(incidentId, "d", "File: x.md\n+ content"));
        long elapsed = System.currentTimeMillis() - start;

        assertTrue(elapsed < 10_000, "hung endpoint must fail loudly in bounded time, took " + elapsed + "ms");
        // Loud failure, never fabricated: nothing recorded on any surface.
        verify(incidentCommandService, never()).addEvent(any(), any(), any());
        verify(incidentRepository, never()).save(any());
        verify(healingActionRepository, never()).save(any());
    }

    /**
     * The PRODUCTION RestTemplate factory (what the real service uses) must carry
     * the bounded timeouts — 5s connect / 15s read — proving the infinite-timeout
     * defect is actually wired away in production, not just in tests.
     */
    @Test
    public void productionRestTemplate_UsesBoundedTimeouts() throws Exception {
        java.lang.reflect.Method m = GitHubIntegrationService.class.getDeclaredMethod("buildRestTemplate");
        m.setAccessible(true);
        RestTemplate prod = (RestTemplate) m.invoke(null);
        SimpleClientHttpRequestFactory factory =
                (SimpleClientHttpRequestFactory) prod.getRequestFactory();
        // Spring 6.1 removed the timeout getters; read the private fields.
        java.lang.reflect.Field connectField =
                SimpleClientHttpRequestFactory.class.getDeclaredField("connectTimeout");
        java.lang.reflect.Field readField =
                SimpleClientHttpRequestFactory.class.getDeclaredField("readTimeout");
        connectField.setAccessible(true);
        readField.setAccessible(true);
        assertEquals(5_000, connectField.getInt(factory), "production connect timeout must be 5s");
        assertEquals(15_000, readField.getInt(factory), "production read timeout must be 15s");
    }

    private void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
