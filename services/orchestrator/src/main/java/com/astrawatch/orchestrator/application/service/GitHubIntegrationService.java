package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.adapter.out.persistence.GitHubIntegrationRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.GitHubRepositoryRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.HealingActionRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.domain.model.GitHubIntegration;
import com.astrawatch.orchestrator.domain.model.GitHubRepository;
import com.astrawatch.orchestrator.domain.model.HealingAction;
import com.astrawatch.orchestrator.domain.model.Incident;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
public class GitHubIntegrationService {

    private static final Logger log = LoggerFactory.getLogger(GitHubIntegrationService.class);

    private final GitHubIntegrationRepository integrationRepository;
    private final GitHubRepositoryRepository repositoryRepository;
    private final IncidentRepository incidentRepository;
    private final HealingActionRepository healingActionRepository;
    private final IncidentCommandService incidentCommandService;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;

    /**
     * Swappable GitHub API base URL (defaults to the public API). Behavior tests
     * point this at an in-process HTTP stub so the real REST sequence (refs,
     * contents, pulls) is exercised over actual HTTP — not a mocked client.
     */
    private String githubApiBase = "https://api.github.com";

    @Autowired
    public GitHubIntegrationService(GitHubIntegrationRepository integrationRepository,
                                   GitHubRepositoryRepository repositoryRepository,
                                   IncidentRepository incidentRepository,
                                   HealingActionRepository healingActionRepository,
                                   IncidentCommandService incidentCommandService,
                                   ObjectMapper objectMapper) {
        this(integrationRepository, repositoryRepository, incidentRepository,
                healingActionRepository, incidentCommandService, objectMapper, buildRestTemplate());
    }

    /**
     * Bounded HTTP client. The default RestTemplate has INFINITE connect/read
     * timeouts — the auto-PR path runs inline on the Kafka consumer thread, so a
     * hung GitHub connection would stall the entire orchestrator-group consumer
     * (all partitions, all services) indefinitely. 5s connect / 15s read bounds
     * the worst case and lets the outer flow fail loudly instead.
     */
    private static RestTemplate buildRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(15_000);
        return new RestTemplate(factory);
    }

    // Testable constructor: allows injecting a mocked RestTemplate so the GitHub
    // REST interactions can be verified without network access.
    public GitHubIntegrationService(GitHubIntegrationRepository integrationRepository,
                             GitHubRepositoryRepository repositoryRepository,
                             IncidentRepository incidentRepository,
                             HealingActionRepository healingActionRepository,
                             IncidentCommandService incidentCommandService,
                             ObjectMapper objectMapper,
                             RestTemplate restTemplate) {
        this.integrationRepository = integrationRepository;
        this.repositoryRepository = repositoryRepository;
        this.incidentRepository = incidentRepository;
        this.healingActionRepository = healingActionRepository;
        this.incidentCommandService = incidentCommandService;
        this.objectMapper = objectMapper;
        this.restTemplate = restTemplate;
    }

    public void setGitHubApiBase(String base) {
        this.githubApiBase = base;
    }

    @Transactional
    public Map<String, Object> connectGitHub(UUID tenantId, UUID serviceId, String accessToken, String repoOwner, String repoName, String defaultBranch) {
        UUID effectiveTenantId = tenantId != null ? tenantId : UUID.randomUUID();

        GitHubIntegration integration = integrationRepository.findByTenantId(effectiveTenantId)
                .orElseGet(() -> GitHubIntegration.builder()
                        .tenantId(effectiveTenantId)
                        .accessToken(accessToken)
                        .scope("repo,workflow")
                        .build());

        integration.setAccessToken(accessToken);
        final GitHubIntegration savedIntegration = integrationRepository.save(integration);
        final UUID integrationId = savedIntegration.getId();

        String branch = (defaultBranch != null && !defaultBranch.isBlank()) ? defaultBranch : "main";

        GitHubRepository repository = repositoryRepository.findByRepoOwnerAndRepoName(repoOwner, repoName)
                .orElseGet(() -> GitHubRepository.builder()
                        .integrationId(integrationId)
                        .tenantId(effectiveTenantId)
                        .serviceId(serviceId)
                        .repoOwner(repoOwner)
                        .repoName(repoName)
                        .defaultBranch(branch)
                        .repoUrl("https://github.com/" + repoOwner + "/" + repoName)
                        .active(true)
                        .build());

        repository.setIntegrationId(integrationId);
        repository.setTenantId(effectiveTenantId);
        if (serviceId != null) {
            repository.setServiceId(serviceId);
        }
        repository.setDefaultBranch(branch);
        repository.setActive(true);
        repository = repositoryRepository.save(repository);

        log.info("GitHub connected successfully for tenant={}, service={}, repo={}/{}",
                effectiveTenantId, serviceId, repoOwner, repoName);

        Map<String, Object> response = new HashMap<>();
        response.put("integrationId", integration.getId().toString());
        response.put("repositoryId", repository.getId().toString());
        response.put("repoOwner", repository.getRepoOwner());
        response.put("repoName", repository.getRepoName());
        response.put("defaultBranch", repository.getDefaultBranch());
        response.put("repoUrl", repository.getRepoUrl());
        response.put("serviceId", repository.getServiceId() != null ? repository.getServiceId().toString() : null);
        return response;
    }

    @Transactional(readOnly = true)
    public List<GitHubRepository> getConnectedRepos(UUID tenantId, UUID serviceId) {
        if (serviceId != null) {
            return repositoryRepository.findByServiceId(serviceId)
                    .map(List::of)
                    .orElseGet(List::of);
        } else if (tenantId != null) {
            return repositoryRepository.findByTenantId(tenantId);
        }
        return repositoryRepository.findAll();
    }

    /**
     * Validates read access to a GitHub repo without persisting anything. The
     * audit found the frontend's GitHub modal faked success ("simulate connection
     * test feedback") because no real test endpoint existed. This hits the GitHub
     * API and reports the truth. Falls back to a clean error when GitHub is
     * unreachable — never a fabricated success.
     */
    public Map<String, Object> testConnection(String repoOwner, String repoName, String accessToken) {
        Map<String, Object> result = new HashMap<>();
        try {
            String token = (accessToken == null || accessToken.isBlank())
                    ? integrationRepository.findByTenantId(null).map(GitHubIntegration::getAccessToken).orElse("")
                    : accessToken;
            String url = githubApiBase + "/repos/" + repoOwner + "/" + repoName;
            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.setBearerAuth(token);
            headers.set("Accept", "application/vnd.github+json");
            org.springframework.http.HttpEntity<Void> entity = new org.springframework.http.HttpEntity<>(headers);
            org.springframework.http.ResponseEntity<Map> resp = restTemplate.exchange(
                    url, org.springframework.http.HttpMethod.GET, entity, Map.class);
            result.put("success", resp.getStatusCode().is2xxSuccessful());
            result.put("statusCode", resp.getStatusCode().value());
            result.put("repoUrl", "https://github.com/" + repoOwner + "/" + repoName);
            if (resp.getBody() != null) {
                Object fullName = resp.getBody().get("full_name");
                result.put("fullName", fullName);
            }
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", e.getMessage() != null ? e.getMessage() : "GitHub API unreachable");
        }
        return result;
    }

    // Deliberately NOT @Transactional: the GitHub REST round-trips (refs, contents,
    // pulls) run inside this method, and a transaction would pin a pooled DB
    // connection for their full duration. Each repository call below is already
    // self-transactional, and the PR on GitHub is the source of truth — the
    // metadata recording here is best-effort, so partial persistence on a crash
    // is acceptable and never fabricates a PR.
    public String createRemediationPullRequest(UUID incidentId, String aiAnalysis, String codePatch) {
        log.info("Initiating automated remediation PR creation for incidentId={}", incidentId);

        Incident incident = incidentRepository.findById(incidentId)
                .orElseThrow(() -> new IllegalArgumentException("Incident not found: " + incidentId));

        // Strict tenant+service scoping: NEVER fall back to an arbitrary repo or a mock token.
        GitHubRepository repo = repositoryRepository.findByServiceId(incident.getServiceId())
                .orElseThrow(() -> new IllegalStateException(
                        "No linked GitHub repository for service: " + incident.getServiceId()));

        GitHubIntegration integration = integrationRepository.findById(repo.getIntegrationId())
                .orElseThrow(() -> new IllegalStateException(
                        "No GitHub integration linked to repository " + repo.getRepoOwner() + "/" + repo.getRepoName()));

        if (integration.getAccessToken() == null || integration.getAccessToken().isBlank()) {
            throw new IllegalStateException(
                    "GitHub access token missing for tenant " + repo.getTenantId()
                            + " — refusing to create remediation PR (no silent mock fallback)");
        }
        String token = integration.getAccessToken();

        String owner = repo.getRepoOwner();
        String repoName = repo.getRepoName();
        String defaultBranch = repo.getDefaultBranch() != null ? repo.getDefaultBranch() : "main";
        String branchName = "astrawatch/fix-incident-" + incidentId;

        String prUrl = null;

        try {
            // 1. Get default branch ref SHA
            String baseSha = getBranchRefSha(owner, repoName, defaultBranch, token);

            // 2. Create new branch refs/heads/astrawatch/fix-incident-<incidentId>
            createBranchRef(owner, repoName, branchName, baseSha, token);

            // 3. Commit AI-generated code patch to target file
            String targetFile = extractTargetFile(codePatch);
            commitPatchFile(owner, repoName, branchName, targetFile, codePatch, incidentId, token);

            // 4. Open Pull Request
            String markdownBody = buildPullRequestBody(incident, aiAnalysis, codePatch);
            prUrl = openPullRequest(owner, repoName, branchName, defaultBranch, incident.getTitle(), markdownBody, token);

        } catch (Exception e) {
            // Fail loudly: never fabricate a PR URL. A remediation that never happened
            // must not be recorded as if it did.
            log.error("GitHub REST API operation failed for incidentId={}, no fallback: {}", incidentId, e.getMessage());
            throw new IllegalStateException("Failed to create remediation PR for incident " + incidentId + ": " + e.getMessage(), e);
        }

        // 5. Log events and record PR URL in Incident and HealingAction metadata!
        incidentCommandService.addEvent(incidentId, "github.pr_created",
                String.format("{\"prUrl\":\"%s\",\"branch\":\"%s\"}", prUrl, branchName));

        incident.setResolutionNote((incident.getResolutionNote() != null ? incident.getResolutionNote() + "\n" : "") + "GitHub PR: " + prUrl);
        incidentRepository.save(incident);

        List<HealingAction> actions = healingActionRepository.findByIncidentIdOrderByCreatedAtDesc(incidentId);
        HealingAction healingAction;
        if (!actions.isEmpty()) {
            healingAction = actions.get(0);
            healingAction.setStatus(HealingAction.HealingStatus.EXECUTING);
            healingAction.setParameters(String.format("{\"prUrl\":\"%s\",\"branch\":\"%s\"}", prUrl, branchName));
        } else {
            healingAction = HealingAction.builder()
                    .incidentId(incidentId)
                    .actionType("GITHUB_AUTOMATED_PR")
                    .parameters(String.format("{\"prUrl\":\"%s\",\"branch\":\"%s\"}", prUrl, branchName))
                    .riskScore(30)
                    .status(HealingAction.HealingStatus.EXECUTING)
                    .build();
        }
        healingActionRepository.save(healingAction);

        log.info("Automated PR created successfully for incidentId={}: {}", incidentId, prUrl);
        return prUrl;
    }

    private String getBranchRefSha(String owner, String repo, String branch, String token) {
        try {
            String url = String.format(githubApiBase + "/repos/%s/%s/git/ref/heads/%s", owner, repo, branch);
            HttpHeaders headers = createHeaders(token);
            HttpEntity<Void> entity = new HttpEntity<>(headers);
            ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.GET, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Map objectMap = (Map) response.getBody().get("object");
                if (objectMap != null && objectMap.get("sha") != null) {
                    return (String) objectMap.get("sha");
                }
            }
        } catch (Exception e) {
            log.warn("Failed to fetch branch ref heads/{}: {}", branch, e.getMessage());
        }
        // Fail loudly: a zero SHA would silently poison the branch creation step.
        throw new IllegalStateException("Could not resolve base branch ref heads/" + branch + " on GitHub");
    }

    private void createBranchRef(String owner, String repo, String branchName, String baseSha, String token) {
        try {
            String url = String.format(githubApiBase + "/repos/%s/%s/git/refs", owner, repo);
            HttpHeaders headers = createHeaders(token);
            Map<String, Object> body = Map.of(
                    "ref", "refs/heads/" + branchName,
                    "sha", baseSha
            );
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            restTemplate.postForEntity(url, entity, Map.class);
        } catch (HttpStatusCodeException e) {
            // Idempotent retry: a re-run after a partial failure finds the branch
            // already created (GitHub 422 "Reference already exists") — that is
            // success, not an error. Any other status stays a warning so the
            // outer flow still fails loudly at the PR step. The body may be null
            // on synthesized client-side exceptions — guard before reading it.
            if (e.getStatusCode() == HttpStatus.UNPROCESSABLE_ENTITY) {
                String body = e.getResponseBodyAsString();
                if (body != null && body.toLowerCase().contains("already exists")) {
                    log.info("Branch refs/heads/{} already exists (retry after partial failure), continuing", branchName);
                    return;
                }
            }
            log.warn("Failed to create branch ref refs/heads/{}: {}", branchName, e.getMessage());
        } catch (Exception e) {
            log.warn("Failed to create branch ref refs/heads/{}: {}", branchName, e.getMessage());
        }
    }

    private void commitPatchFile(String owner, String repo, String branchName, String filePath, String codePatch, UUID incidentId, String token) {
        try {
            String existingSha = null;
            try {
                String getUrl = String.format(githubApiBase + "/repos/%s/%s/contents/%s?ref=%s", owner, repo, filePath, branchName);
                HttpHeaders headers = createHeaders(token);
                HttpEntity<Void> entity = new HttpEntity<>(headers);
                ResponseEntity<Map> getResp = restTemplate.exchange(getUrl, HttpMethod.GET, entity, Map.class);
                if (getResp.getStatusCode().is2xxSuccessful() && getResp.getBody() != null) {
                    existingSha = (String) getResp.getBody().get("sha");
                }
            } catch (Exception ignored) {}

            String url = String.format(githubApiBase + "/repos/%s/%s/contents/%s", owner, repo, filePath);
            HttpHeaders headers = createHeaders(token);
            // The codePatch carries a "File: <path>\n<content>" header used for
            // extractTargetFile — strip that header line before committing so the
            // repo file contains only the real patch content, never the marker.
            String fileContent = codePatch != null ? codePatch : "";
            if (fileContent.startsWith("File: ")) {
                int nl = fileContent.indexOf('\n');
                // Guard the edge case "File: x" with no trailing newline.
                fileContent = nl >= 0 ? fileContent.substring(nl + 1) : "";
            }
            String base64Content = Base64.getEncoder().encodeToString(fileContent.getBytes(StandardCharsets.UTF_8));

            Map<String, Object> body = new HashMap<>();
            body.put("message", "AstraWatch AI Remediation for Incident " + incidentId);
            body.put("content", base64Content);
            body.put("branch", branchName);
            if (existingSha != null) {
                body.put("sha", existingSha);
            }

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            restTemplate.exchange(url, HttpMethod.PUT, entity, Map.class);
        } catch (Exception e) {
            log.warn("Failed to commit patch file to GitHub repository: {}", e.getMessage());
        }
    }

    private String openPullRequest(String owner, String repo, String branchName, String baseBranch, String title, String body, String token) {
        try {
            String url = String.format(githubApiBase + "/repos/%s/%s/pulls", owner, repo);
            HttpHeaders headers = createHeaders(token);
            Map<String, Object> reqBody = Map.of(
                    "title", (title != null ? "[AstraWatch Auto-Remediation] " + title : "[AstraWatch] Auto Remediation PR"),
                    "head", branchName,
                    "base", baseBranch != null ? baseBranch : "main",
                    "body", body
            );
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(reqBody, headers);
            ResponseEntity<Map> response = restTemplate.postForEntity(url, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                String htmlUrl = (String) response.getBody().get("html_url");
                if (htmlUrl != null) return htmlUrl;
            }
        } catch (HttpStatusCodeException e) {
            // Idempotency / state recovery: a prior attempt may have opened the
            // PR but crashed before recording the URL. GitHub rejects the second
            // POST with 422 "A pull request already exists for these branches" —
            // instead of failing (and leaving a zombie PR unlinked), recover the
            // existing PR's URL so the incident gets the real link.
            if (e.getStatusCode() == HttpStatus.UNPROCESSABLE_ENTITY) {
                String existing = findExistingPullRequest(owner, repo, branchName, token);
                if (existing != null) {
                    log.info("Recovered existing PR for branch {} (prior partial failure): {}", branchName, existing);
                    return existing;
                }
            }
            log.warn("Failed to open pull request on GitHub: {}", e.getMessage());
        } catch (Exception e) {
            log.warn("Failed to open pull request on GitHub: {}", e.getMessage());
        }
        throw new IllegalStateException("Failed to open pull request on GitHub for " + owner + "/" + repo);
    }

    /**
     * Looks up an already-open PR for the remediation branch (head=owner:branch)
     * and returns its html_url, or null when none exists. Used to recover from a
     * duplicate-PR 422 so a retry never orphans a real PR from the incident.
     */
    private String findExistingPullRequest(String owner, String repo, String branchName, String token) {
        try {
            String url = String.format(githubApiBase + "/repos/%s/%s/pulls?head=%s:%s&state=all",
                    owner, repo, owner, branchName);
            HttpHeaders headers = createHeaders(token);
            HttpEntity<Void> entity = new HttpEntity<>(headers);
            ResponseEntity<List> response = restTemplate.exchange(url, HttpMethod.GET, entity, List.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                for (Object item : response.getBody()) {
                    if (item instanceof Map<?, ?> pr && pr.get("html_url") != null) {
                        return String.valueOf(pr.get("html_url"));
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to look up existing PR for branch {}: {}", branchName, e.getMessage());
        }
        return null;
    }

    private HttpHeaders createHeaders(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(List.of(MediaType.parseMediaType("application/vnd.github.v3+json")));
        if (token != null && !token.isBlank() && !"mock_github_token".equals(token)) {
            headers.setBearerAuth(token);
        }
        return headers;
    }

    private String extractTargetFile(String codePatch) {
        String target = null;
        if (codePatch != null && codePatch.contains("File: ")) {
            int idx = codePatch.indexOf("File: ");
            int end = codePatch.indexOf("\n", idx);
            if (end > idx) {
                target = codePatch.substring(idx + 6, end).trim();
            }
        }
        // Hardening (audit review): reject empty, absolute, or path-traversal
        // targets — a malicious/LLM-supplied "File: ../../x" must never escape the
        // repo root via the GitHub contents API.
        if (target == null || target.isEmpty() || target.startsWith("/")
                || target.contains("..")) {
            throw new IllegalStateException("Unsafe remediation target file: '" + target + "'");
        }
        return target;
    }

    private String buildPullRequestBody(Incident incident, String aiAnalysis, String codePatch) {
        StringBuilder sb = new StringBuilder();
        sb.append("## 🚨 AstraWatch Incident Remediation PR\n\n");
        sb.append("### 📊 Anomaly Summary & Affected Metrics\n");
        sb.append("- **Incident ID**: `").append(incident.getId()).append("`\n");
        sb.append("- **Severity**: `").append(incident.getSeverity()).append("`\n");
        sb.append("- **Title**: ").append(incident.getTitle() != null ? incident.getTitle() : "N/A").append("\n");
        sb.append("- **Description**: ").append(incident.getDescription() != null ? incident.getDescription() : "N/A").append("\n\n");

        sb.append("### 🔍 Root Cause Diagnosis (\"What & Why\")\n");
        sb.append(aiAnalysis != null ? aiAnalysis : (incident.getRootCause() != null ? incident.getRootCause() : "AI identified root cause based on telemetry anomalies.")).append("\n\n");

        sb.append("### 🛠️ AI-Suggested Code Solution Diff\n");
        sb.append("```diff\n");
        sb.append(codePatch != null ? codePatch : "// Suggested remediation patch").append("\n");
        sb.append("```\n\n");

        sb.append("---\n");
        sb.append("🔗 **[View in AstraWatch Incident Dashboard](https://dashboard.astrawatch.io/incidents/").append(incident.getId()).append(")**\n");
        return sb.toString();
    }
}
