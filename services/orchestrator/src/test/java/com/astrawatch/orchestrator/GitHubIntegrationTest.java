package com.astrawatch.orchestrator;

import com.astrawatch.orchestrator.adapter.out.persistence.GitHubIntegrationRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.GitHubRepositoryRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.HealingActionRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.application.service.GitHubIntegrationService;
import com.astrawatch.orchestrator.application.service.IncidentCommandService;
import com.astrawatch.orchestrator.domain.model.GitHubIntegration;
import com.astrawatch.orchestrator.domain.model.GitHubRepository;
import com.astrawatch.orchestrator.domain.model.Incident;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import org.mockito.ArgumentCaptor;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

public class GitHubIntegrationTest {

    private GitHubIntegrationRepository integrationRepository;
    private GitHubRepositoryRepository repositoryRepository;
    private IncidentRepository incidentRepository;
    private HealingActionRepository healingActionRepository;
    private IncidentCommandService incidentCommandService;
    private ObjectMapper objectMapper;
    private RestTemplate restTemplate;
    private GitHubIntegrationService gitHubIntegrationService;

    @BeforeEach
    public void setUp() {
        integrationRepository = mock(GitHubIntegrationRepository.class);
        repositoryRepository = mock(GitHubRepositoryRepository.class);
        incidentRepository = mock(IncidentRepository.class);
        healingActionRepository = mock(HealingActionRepository.class);
        incidentCommandService = mock(IncidentCommandService.class);
        objectMapper = new ObjectMapper();
        restTemplate = mock(RestTemplate.class);

        gitHubIntegrationService = new GitHubIntegrationService(
                integrationRepository,
                repositoryRepository,
                incidentRepository,
                healingActionRepository,
                incidentCommandService,
                objectMapper,
                restTemplate
        );
    }

    @Test
    public void testConnectGitHubRepository() {
        UUID tenantId = UUID.randomUUID();
        UUID serviceId = UUID.randomUUID();

        when(integrationRepository.findByTenantId(tenantId)).thenReturn(Optional.empty());
        when(integrationRepository.save(any(GitHubIntegration.class))).thenAnswer(invocation -> {
            GitHubIntegration g = invocation.getArgument(0);
            g.setId(UUID.randomUUID());
            return g;
        });

        when(repositoryRepository.findByRepoOwnerAndRepoName("astrawatch-org", "payment-service"))
                .thenReturn(Optional.empty());
        when(repositoryRepository.save(any(GitHubRepository.class))).thenAnswer(invocation -> {
            GitHubRepository r = invocation.getArgument(0);
            r.setId(UUID.randomUUID());
            return r;
        });

        Map<String, Object> result = gitHubIntegrationService.connectGitHub(
                tenantId, serviceId, "token_123", "astrawatch-org", "payment-service", "main"
        );

        assertNotNull(result.get("integrationId"));
        assertNotNull(result.get("repositoryId"));
        assertEquals("astrawatch-org", result.get("repoOwner"));
        assertEquals("payment-service", result.get("repoName"));
        assertEquals("main", result.get("defaultBranch"));

        verify(integrationRepository).save(any(GitHubIntegration.class));
        verify(repositoryRepository).save(any(GitHubRepository.class));
    }

    @Test
    public void testCreateRemediationPullRequest() {
        UUID incidentId = UUID.randomUUID();
        UUID serviceId = UUID.randomUUID();
        UUID integrationId = UUID.randomUUID();

        Incident incident = Incident.builder()
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
                .repoOwner("astrawatch-demo")
                .repoName("backend-service")
                .defaultBranch("main")
                .build();

        when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
        when(repositoryRepository.findByServiceId(serviceId)).thenReturn(Optional.of(repo));
        when(integrationRepository.findById(integrationId)).thenReturn(Optional.of(integration));

        // GitHub API interactions (all real calls, mocked at the HTTP layer).
        // 1. GET ref heads/main -> {object:{sha}}
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(new ResponseEntity<>(Map.of("object", Map.of("sha", "abc123def")), HttpStatus.OK));

        // 3. PUT contents -> 200
        when(restTemplate.exchange(anyString(), eq(HttpMethod.PUT), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(new ResponseEntity<>(Map.of(), HttpStatus.OK));

        // 4. POST pulls -> {html_url}
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(new ResponseEntity<>(Map.of("html_url", "https://github.com/astrawatch-demo/backend-service/pull/42"), HttpStatus.CREATED));

        String prUrl = gitHubIntegrationService.createRemediationPullRequest(
                incidentId,
                "Root cause: Connection pool leak in DB pool manager.",
                "File: src/DBPool.java\n+ pool.setMaxSize(50);"
        );

        assertNotNull(prUrl);
        assertEquals("https://github.com/astrawatch-demo/backend-service/pull/42", prUrl);
        verify(incidentCommandService).addEvent(eq(incidentId), eq("github.pr_created"), contains("prUrl"));
        verify(incidentRepository).save(incident);
    }

    @Test
    @SuppressWarnings("unchecked")
    public void testCreateRemediationPullRequest_StripsFileHeaderFromCommitContent() throws Exception {
        UUID incidentId = UUID.randomUUID();
        UUID serviceId = UUID.randomUUID();
        UUID integrationId = UUID.randomUUID();

        Incident incident = Incident.builder()
                .id(incidentId)
                .serviceId(serviceId)
                .severity(Incident.Severity.HIGH)
                .title("Latency Spike")
                .description("Latencies exceeded threshold")
                .build();

        GitHubIntegration integration = GitHubIntegration.builder()
                .id(integrationId)
                .accessToken("ghp_test12345")
                .build();

        GitHubRepository repo = GitHubRepository.builder()
                .id(UUID.randomUUID())
                .integrationId(integrationId)
                .serviceId(serviceId)
                .repoOwner("astrawatch-demo")
                .repoName("backend-service")
                .defaultBranch("main")
                .build();

        when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
        when(repositoryRepository.findByServiceId(serviceId)).thenReturn(Optional.of(repo));
        when(integrationRepository.findById(integrationId)).thenReturn(Optional.of(integration));

        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(new ResponseEntity<>(Map.of("object", Map.of("sha", "abc123def")), HttpStatus.OK));
        when(restTemplate.exchange(anyString(), eq(HttpMethod.PUT), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(new ResponseEntity<>(Map.of(), HttpStatus.OK));
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(new ResponseEntity<>(Map.of("html_url", "https://github.com/astrawatch-demo/backend-service/pull/7"), HttpStatus.CREATED));

        // The patch uses the "File: <path>\n<content>" header shape. The committed
        // file content must NOT include the "File: " marker line (audit fix).
        String patch = "# AstraWatch Remediation\n\n- Diagnosis: latency spike.\n";
        gitHubIntegrationService.createRemediationPullRequest(
                incidentId, "diagnosis", "File: astrawatch-remediation.md\n" + patch);

        // Capture the PUT contents request and assert the header line is stripped.
        ArgumentCaptor<HttpEntity<Map>> captor = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate, atLeastOnce()).exchange(
                contains("/contents/"), eq(HttpMethod.PUT), captor.capture(), eq(Map.class));
        Map capturedBody = captor.getValue().getBody();
        String committed = new String(
                Base64.getDecoder().decode((String) capturedBody.get("content")),
                StandardCharsets.UTF_8);
        assertFalse(committed.startsWith("File: "), "committed file must not contain the File: marker");
        assertTrue(committed.contains("AstraWatch Remediation"));
        assertFalse(committed.contains("File: astrawatch-remediation.md"));
    }

    @Test
    public void testCreateRemediationPullRequest_RejectsUnsafeTargetFile() {
        UUID incidentId = UUID.randomUUID();
        UUID serviceId = UUID.randomUUID();
        UUID integrationId = UUID.randomUUID();

        Incident incident = Incident.builder()
                .id(incidentId)
                .serviceId(serviceId)
                .severity(Incident.Severity.HIGH)
                .title("Latency Spike")
                .build();

        GitHubIntegration integration = GitHubIntegration.builder()
                .id(integrationId)
                .accessToken("ghp_test12345")
                .build();

        GitHubRepository repo = GitHubRepository.builder()
                .id(UUID.randomUUID())
                .integrationId(integrationId)
                .serviceId(serviceId)
                .repoOwner("astrawatch-demo")
                .repoName("backend-service")
                .defaultBranch("main")
                .build();

        when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
        when(repositoryRepository.findByServiceId(serviceId)).thenReturn(Optional.of(repo));
        when(integrationRepository.findById(integrationId)).thenReturn(Optional.of(integration));

        // Path traversal in the File: header must fail loudly — never commit
        // outside the repo root via the GitHub contents API.
        assertThrows(IllegalStateException.class, () ->
                gitHubIntegrationService.createRemediationPullRequest(
                        incidentId, "diagnosis", "File: ../../etc/passwd\n+ fix"));
        assertThrows(IllegalStateException.class, () ->
                gitHubIntegrationService.createRemediationPullRequest(
                        incidentId, "diagnosis", "File: /etc/secret\n+ fix"));
    }

    @Test
    public void testCreateRemediationPullRequest_FailsLoudlyWithoutToken() {
        UUID incidentId = UUID.randomUUID();
        UUID serviceId = UUID.randomUUID();
        UUID integrationId = UUID.randomUUID();

        Incident incident = Incident.builder()
                .id(incidentId)
                .serviceId(serviceId)
                .severity(Incident.Severity.HIGH)
                .title("Latency Spike")
                .build();

        // Integration exists but has NO access token (mock token removed — must not fall back).
        GitHubIntegration integration = GitHubIntegration.builder()
                .id(integrationId)
                .build();

        GitHubRepository repo = GitHubRepository.builder()
                .id(UUID.randomUUID())
                .integrationId(integrationId)
                .serviceId(serviceId)
                .repoOwner("astrawatch-demo")
                .repoName("backend-service")
                .defaultBranch("main")
                .build();

        when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
        when(repositoryRepository.findByServiceId(serviceId)).thenReturn(Optional.of(repo));
        when(integrationRepository.findById(integrationId)).thenReturn(Optional.of(integration));

        assertThrows(IllegalStateException.class, () ->
                gitHubIntegrationService.createRemediationPullRequest(
                        incidentId, "diagnosis", "File: x.java\n+ fix"));
    }

    @Test
    public void testCreateRemediationPullRequest_RecoversExistingPrOnDuplicate422() {
        // Adversarial-review fix: if a prior attempt opened the PR but crashed
        // before recording it, the retry's POST /pulls gets 422 "A pull request
        // already exists for these branches". The service must recover the
        // existing PR's URL instead of failing and orphaning it from the incident.
        UUID incidentId = UUID.randomUUID();
        UUID serviceId = UUID.randomUUID();
        UUID integrationId = UUID.randomUUID();

        Incident incident = Incident.builder()
                .id(incidentId)
                .serviceId(serviceId)
                .severity(Incident.Severity.HIGH)
                .title("Latency Spike")
                .description("Latencies exceeded threshold")
                .build();

        GitHubIntegration integration = GitHubIntegration.builder()
                .id(integrationId)
                .accessToken("ghp_test12345")
                .build();

        GitHubRepository repo = GitHubRepository.builder()
                .id(UUID.randomUUID())
                .integrationId(integrationId)
                .serviceId(serviceId)
                .repoOwner("astrawatch-demo")
                .repoName("backend-service")
                .defaultBranch("main")
                .build();

        when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
        when(repositoryRepository.findByServiceId(serviceId)).thenReturn(Optional.of(repo));
        when(integrationRepository.findById(integrationId)).thenReturn(Optional.of(integration));

        // GET ref heads/main -> sha
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(new ResponseEntity<>(Map.of("object", Map.of("sha", "abc123def")), HttpStatus.OK));
        // PUT contents -> 200
        when(restTemplate.exchange(anyString(), eq(HttpMethod.PUT), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(new ResponseEntity<>(Map.of(), HttpStatus.OK));
        // POST pulls -> 422 duplicate (the PR already exists from a prior attempt)
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                .thenThrow(new HttpClientErrorException(
                        HttpStatus.UNPROCESSABLE_ENTITY,
                        "A pull request already exists for these branches",
                        HttpHeaders.EMPTY, new byte[0], StandardCharsets.UTF_8));
        // Recovery lookup GET pulls?head=...&state=all -> existing PR
        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(List.class)))
                .thenReturn(new ResponseEntity<>(List.of(Map.of("html_url", "https://github.com/astrawatch-demo/backend-service/pull/42")), HttpStatus.OK));

        String prUrl = gitHubIntegrationService.createRemediationPullRequest(
                incidentId, "diagnosis", "File: x.java\n+ fix");

        assertEquals("https://github.com/astrawatch-demo/backend-service/pull/42", prUrl);
        // The recovered URL is recorded on the incident, not lost.
        verify(incidentCommandService).addEvent(eq(incidentId), eq("github.pr_created"), contains("pull/42"));
        verify(incidentRepository).save(incident);
    }

    @Test
    public void testCreateRemediationPullRequest_Duplicate422NoRecoveryFailsLoudly() {
        // If the duplicate-422 recovery lookup finds no existing PR, the flow
        // must still fail loudly — never fabricate a URL or record a PR that
        // cannot be confirmed.
        UUID incidentId = UUID.randomUUID();
        UUID serviceId = UUID.randomUUID();
        UUID integrationId = UUID.randomUUID();

        Incident incident = Incident.builder()
                .id(incidentId)
                .serviceId(serviceId)
                .severity(Incident.Severity.HIGH)
                .title("Latency Spike")
                .build();

        GitHubIntegration integration = GitHubIntegration.builder()
                .id(integrationId)
                .accessToken("ghp_test12345")
                .build();

        GitHubRepository repo = GitHubRepository.builder()
                .id(UUID.randomUUID())
                .integrationId(integrationId)
                .serviceId(serviceId)
                .repoOwner("astrawatch-demo")
                .repoName("backend-service")
                .defaultBranch("main")
                .build();

        when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
        when(repositoryRepository.findByServiceId(serviceId)).thenReturn(Optional.of(repo));
        when(integrationRepository.findById(integrationId)).thenReturn(Optional.of(integration));

        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(new ResponseEntity<>(Map.of("object", Map.of("sha", "abc123def")), HttpStatus.OK));
        when(restTemplate.exchange(anyString(), eq(HttpMethod.PUT), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(new ResponseEntity<>(Map.of(), HttpStatus.OK));
        // POST pulls -> 422 duplicate, but the recovery GET returns an empty list
        // (the PR is genuinely gone / never created) — unstubbed List GET returns
        // null, which findExistingPullRequest treats as "no PR".
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                .thenThrow(new HttpClientErrorException(
                        HttpStatus.UNPROCESSABLE_ENTITY,
                        "A pull request already exists for these branches",
                        HttpHeaders.EMPTY, new byte[0], StandardCharsets.UTF_8));

        assertThrows(IllegalStateException.class, () ->
                gitHubIntegrationService.createRemediationPullRequest(
                        incidentId, "diagnosis", "File: x.java\n+ fix"));
        // Nothing recorded — no fabricated PR link.
        verify(incidentCommandService, never()).addEvent(any(), any(), any());
        verify(incidentRepository, never()).save(any());
    }

    @Test
    public void testCreateRemediationPullRequest_BranchAlreadyExistsContinues() {
        // Adversarial-review fix: re-running after a partial failure finds the
        // branch already created (422 "Reference already exists") — that must be
        // treated as success so the retry proceeds to commit + PR.
        UUID incidentId = UUID.randomUUID();
        UUID serviceId = UUID.randomUUID();
        UUID integrationId = UUID.randomUUID();

        Incident incident = Incident.builder()
                .id(incidentId)
                .serviceId(serviceId)
                .severity(Incident.Severity.HIGH)
                .title("Latency Spike")
                .build();

        GitHubIntegration integration = GitHubIntegration.builder()
                .id(integrationId)
                .accessToken("ghp_test12345")
                .build();

        GitHubRepository repo = GitHubRepository.builder()
                .id(UUID.randomUUID())
                .integrationId(integrationId)
                .serviceId(serviceId)
                .repoOwner("astrawatch-demo")
                .repoName("backend-service")
                .defaultBranch("main")
                .build();

        when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
        when(repositoryRepository.findByServiceId(serviceId)).thenReturn(Optional.of(repo));
        when(integrationRepository.findById(integrationId)).thenReturn(Optional.of(integration));

        when(restTemplate.exchange(anyString(), eq(HttpMethod.GET), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(new ResponseEntity<>(Map.of("object", Map.of("sha", "abc123def")), HttpStatus.OK));
        when(restTemplate.exchange(anyString(), eq(HttpMethod.PUT), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(new ResponseEntity<>(Map.of(), HttpStatus.OK));
        // First postForEntity (branch ref POST) -> 422 already exists; second
        // (pulls POST) -> success. Mockito applies stubs in call order.
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
                .thenThrow(new HttpClientErrorException(
                        HttpStatus.UNPROCESSABLE_ENTITY,
                        "Reference already exists",
                        HttpHeaders.EMPTY, new byte[0], StandardCharsets.UTF_8))
                .thenReturn(new ResponseEntity<>(Map.of("html_url", "https://github.com/astrawatch-demo/backend-service/pull/7"), HttpStatus.CREATED));

        String prUrl = gitHubIntegrationService.createRemediationPullRequest(
                incidentId, "diagnosis", "File: x.java\n+ fix");

        assertEquals("https://github.com/astrawatch-demo/backend-service/pull/7", prUrl);
        verify(incidentCommandService).addEvent(eq(incidentId), eq("github.pr_created"), contains("pull/7"));
    }

    @Test
    public void testCreateRemediationPullRequest_FailsLoudlyWithoutLinkedRepo() {
        UUID incidentId = UUID.randomUUID();
        UUID serviceId = UUID.randomUUID();

        Incident incident = Incident.builder()
                .id(incidentId)
                .serviceId(serviceId)
                .severity(Incident.Severity.HIGH)
                .title("Latency Spike")
                .build();

        when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
        // No repo for this service, and the old cross-tenant findAll fallback is gone.
        when(repositoryRepository.findByServiceId(serviceId)).thenReturn(Optional.empty());

        assertThrows(IllegalStateException.class, () ->
                gitHubIntegrationService.createRemediationPullRequest(
                        incidentId, "diagnosis", "File: x.java\n+ fix"));

        verify(repositoryRepository, never()).findAll();
    }
}
