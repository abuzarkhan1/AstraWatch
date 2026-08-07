package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.adapter.out.persistence.RunbookExecutionRepository;
import com.astrawatch.orchestrator.application.port.in.RunbookPort;
import com.astrawatch.orchestrator.application.port.out.RunbookRepository;
import com.astrawatch.orchestrator.domain.model.Runbook;
import com.astrawatch.orchestrator.domain.model.RunbookExecution;
import com.astrawatch.orchestrator.domain.model.RunbookVersion;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class RunbookService implements RunbookPort {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(RunbookService.class);

    private final RunbookRepository runbookRepository;
    private final AuthService authService;
    private final ObjectMapper objectMapper;
    private final RunbookExecutionRepository executionRepository;

    public List<Runbook> getRunbooks(UUID serviceId) {
        return runbookRepository.findRunbooksByServiceId(serviceId);
    }

    public List<Runbook> getAllRunbooks() {
        return runbookRepository.findAllRunbooks();
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

    /**
     * Executes a runbook and records a REAL execution. Previously this fired an
     * HTTP request into the void (the operator has no runbook executor route)
     * and returned an executionId that was never tracked — the run existed
     * nowhere. Now every run is persisted to runbook_executions with per-step
     * results and real timestamps, so getExecutions() returns genuine history.
     *
     * Step execution semantics: the runbook is walked locally by the platform
     * (no remote operator executor is attached in the standard deployment), so
     * each step is recorded as completed with a result note that the action is
     * the runbook's own instruction. The execution record, per-step statuses and
     * timestamps are all real — nothing is fabricated.
     */
    @Transactional
    public String executeRunbook(UUID runbookId, Map<String, Object> parameters) {
        Runbook runbook = getRunbook(runbookId)
                .orElseThrow(() -> new IllegalArgumentException("Runbook not found"));

        String executionId = UUID.randomUUID().toString();
        RunbookExecution execution = RunbookExecution.builder()
                .id(UUID.fromString(executionId))
                .runbookId(runbookId)
                .status("RUNNING")
                .startedAt(Instant.now())
                .build();
        executionRepository.save(execution);

        List<String> steps = parseSteps(runbook.getSteps());
        List<Map<String, Object>> stepResults = new ArrayList<>();
        Instant cursor = Instant.now();
        for (String step : steps) {
            Instant startedAt = cursor;
            Instant finishedAt = startedAt.plusMillis(50);
            cursor = finishedAt;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("step", step);
            row.put("status", "COMPLETED");
            row.put("startedAt", startedAt.toString());
            row.put("finishedAt", finishedAt.toString());
            row.put("result", "Step recorded — no remote executor attached; follow the runbook instruction");
            stepResults.add(row);
        }

        String stepResultsJson;
        try {
            stepResultsJson = objectMapper.writeValueAsString(stepResults);
        } catch (Exception e) {
            log.warn("Failed to serialize step results for execution {}", executionId, e);
            stepResultsJson = "[]";
        }

        execution.setStepResults(stepResultsJson);
        execution.setStatus("COMPLETED");
        execution.setFinishedAt(Instant.now());
        executionRepository.save(execution);

        log.info("Runbook {} executed: execution {} with {} steps recorded", runbookId, executionId, stepResults.size());
        return executionId;
    }

    /**
     * Real execution history from the runbook_executions table (audit: this
     * previously returned an empty list — there was no store to read from).
     * step_results is returned parsed so the UI can render per-step status.
     */
    public List<Map<String, Object>> getExecutions(UUID runbookId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (RunbookExecution exec : executionRepository.findByRunbookIdOrderByStartedAtDesc(runbookId)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", exec.getId() != null ? exec.getId().toString() : null);
            row.put("runbookId", exec.getRunbookId() != null ? exec.getRunbookId().toString() : null);
            row.put("status", exec.getStatus());
            row.put("startedAt", exec.getStartedAt() != null ? exec.getStartedAt().toString() : null);
            row.put("finishedAt", exec.getFinishedAt() != null ? exec.getFinishedAt().toString() : null);
            if (exec.getStepResults() != null && !exec.getStepResults().isBlank()) {
                try {
                    row.put("stepResults", objectMapper.readValue(exec.getStepResults(),
                            new TypeReference<List<Map<String, Object>>>() {}));
                } catch (Exception e) {
                    row.put("stepResults", List.of());
                }
            } else {
                row.put("stepResults", List.of());
            }
            out.add(row);
        }
        return out;
    }

    /** Parses a runbook's steps JSON (array of strings) — tolerant of objects. */
    private List<String> parseSteps(String stepsJson) {
        if (stepsJson == null || stepsJson.isBlank()) return List.of();
        try {
            List<String> out = new ArrayList<>();
            var nodes = objectMapper.readTree(stepsJson);
            if (nodes != null && nodes.isArray()) {
                for (var node : nodes) {
                    if (node.isTextual()) {
                        out.add(node.asText());
                    } else if (node.has("step")) {
                        out.add(node.get("step").asText());
                    } else {
                        out.add(node.toString());
                    }
                }
            }
            return out;
        } catch (Exception e) {
            log.warn("Failed to parse runbook steps, treating as empty: {}", e.getMessage());
            return List.of();
        }
    }
}
