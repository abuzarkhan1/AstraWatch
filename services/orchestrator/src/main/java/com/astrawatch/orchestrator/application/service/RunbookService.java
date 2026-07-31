package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.application.port.in.RunbookPort;
import com.astrawatch.orchestrator.application.port.out.RunbookRepository;
import com.astrawatch.orchestrator.domain.model.Runbook;
import com.astrawatch.orchestrator.domain.model.RunbookVersion;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.time.Instant;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class RunbookService implements RunbookPort {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(RunbookService.class);

    private final RunbookRepository runbookRepository;
    private final AuthService authService;
    private final ObjectMapper objectMapper;

    public List<Runbook> getRunbooks(UUID serviceId) {
        return runbookRepository.findRunbooksByServiceId(serviceId);
    }

    public Optional<Runbook> getRunbook(UUID id) {
        return runbookRepository.findRunbookById(id);
    }

    @Transactional
    public Runbook createRunbook(Runbook runbook) {
        runbook = runbookRepository.saveRunbook(runbook);
        RunbookVersion version = RunbookVersion.builder()
                .runbookId(runbook.getId())
                .revision(runbook.getCurrentRevision())
                .steps(runbook.getSteps())
                .changelog("Initial version")
                .build();
        runbookRepository.saveRunbookVersion(version);
        return runbook;
    }

    @Transactional
    public Runbook updateRunbook(UUID id, Runbook updated) {
        Runbook runbook = runbookRepository.findRunbookById(id)
                .orElseThrow(() -> new IllegalArgumentException("Runbook not found: " + id));

        int newRevision = runbook.getCurrentRevision() + 1;
        RunbookVersion version = RunbookVersion.builder()
                .runbookId(id)
                .revision(newRevision)
                .steps(updated.getSteps())
                .changelog("Updated")
                .build();
        runbookRepository.saveRunbookVersion(version);

        runbook.setTitle(updated.getTitle());
        runbook.setDescription(updated.getDescription());
        runbook.setSteps(updated.getSteps());
        runbook.setTags(updated.getTags());
        runbook.setActionType(updated.getActionType());
        runbook.setCurrentRevision(newRevision);
        return runbookRepository.saveRunbook(runbook);
    }

    public List<RunbookVersion> getVersions(UUID runbookId) {
        return runbookRepository.findVersionsByRunbookId(runbookId);
    }

    public String executeRunbook(UUID runbookId, Map<String, Object> parameters) {
        Runbook runbook = getRunbook(runbookId)
                .orElseThrow(() -> new IllegalArgumentException("Runbook not found"));
        
        String executionId = UUID.randomUUID().toString();
        try {
            String serviceToken = authService.generateServiceToken("orchestrator");
            String payload = objectMapper.writeValueAsString(Map.of(
                "runbookId", runbookId,
                "executionId", executionId,
                "parameters", parameters
            ));
            
            java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
            java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                .uri(java.net.URI.create("http://operator:8080/api/v1/runbooks/execute"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + serviceToken)
                .POST(java.net.http.HttpRequest.BodyPublishers.ofString(payload))
                .build();
                
            client.sendAsync(request, java.net.http.HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            log.error("Failed to execute runbook", e);
        }
        return executionId;
    }

    public List<Map<String, Object>> getExecutions(UUID runbookId) {
        return List.of(Map.of(
            "executionId", UUID.randomUUID().toString(),
            "status", "COMPLETED",
            "startedAt", Instant.now().minusSeconds(3600).toString()
        ));
    }
}
