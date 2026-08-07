package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.application.service.GitHubIntegrationService;
import com.astrawatch.orchestrator.domain.model.GitHubRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/integrations/github")
public class GitHubController {

    private final GitHubIntegrationService gitHubIntegrationService;

    public GitHubController(GitHubIntegrationService gitHubIntegrationService) {
        this.gitHubIntegrationService = gitHubIntegrationService;
    }

    @PostMapping("/connect")
    public ResponseEntity<ApiResponse<Map<String, Object>>> connect(@RequestBody Map<String, String> body) {
        try {
            UUID tenantId = body.get("tenantId") != null ? UUID.fromString(body.get("tenantId")) : null;
            UUID serviceId = body.get("serviceId") != null ? UUID.fromString(body.get("serviceId")) : null;
            String accessToken = body.get("accessToken");
            String repoOwner = body.get("repoOwner") != null ? body.get("repoOwner") : body.get("owner");
            String repoName = body.get("repoName") != null ? body.get("repoName") : body.get("repo");
            String defaultBranch = body.get("defaultBranch");

            Map<String, Object> result = gitHubIntegrationService.connectGitHub(tenantId, serviceId, accessToken, repoOwner, repoName, defaultBranch);
            return ResponseEntity.ok(ApiResponse.ok(result));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(new ApiResponse<>(false, Map.of("error", e.getMessage()), Map.of()));
        }
    }

    @GetMapping("/repos")
    public ResponseEntity<ApiResponse<List<GitHubRepository>>> listRepos(
            @RequestParam(required = false) UUID tenantId,
            @RequestParam(required = false) UUID serviceId) {
        List<GitHubRepository> repos = gitHubIntegrationService.getConnectedRepos(tenantId, serviceId);
        return ResponseEntity.ok(ApiResponse.ok(repos));
    }

    @PostMapping("/test")
    public ResponseEntity<ApiResponse<Map<String, Object>>> testConnection(@RequestBody(required = false) Map<String, String> body) {
        if (body == null) {
            return ResponseEntity.badRequest().body(new ApiResponse<>(false,
                    Map.of("error", "Request body is required"), Map.of()));
        }
        String repoOwner = body.get("repoOwner");
        String repoName = body.get("repoName");
        String repo = body.get("repo");
        if ((repoOwner == null || repoName == null) && repo != null && repo.contains("/")) {
            String[] parts = repo.split("/", 2);
            repoOwner = parts[0];
            repoName = parts[1];
        }
        String accessToken = body.get("accessToken") != null ? body.get("accessToken") : body.get("token");
        if (repoOwner == null || repoName == null || repoOwner.isBlank() || repoName.isBlank()) {
            return ResponseEntity.badRequest().body(new ApiResponse<>(false,
                    Map.of("error", "repoOwner and repoName are required"), Map.of()));
        }
        Map<String, Object> result = gitHubIntegrationService.testConnection(repoOwner, repoName, accessToken);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @PostMapping("/create-pr")
    public ResponseEntity<ApiResponse<Map<String, String>>> createPR(@RequestBody Map<String, String> body) {
        try {
            UUID incidentId = UUID.fromString(body.get("incidentId"));
            String aiAnalysis = body.get("aiAnalysis");
            String codePatch = body.get("codePatch");

            String prUrl = gitHubIntegrationService.createRemediationPullRequest(incidentId, aiAnalysis, codePatch);
            return ResponseEntity.ok(ApiResponse.ok(Map.of("prUrl", prUrl)));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(new ApiResponse<>(false, Map.of("error", e.getMessage()), Map.of()));
        }
    }
}
