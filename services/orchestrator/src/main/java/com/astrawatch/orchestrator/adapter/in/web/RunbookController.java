package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.in.web.dto.RunbookDTO;
import com.astrawatch.orchestrator.adapter.in.web.dto.RunbookVersionDTO;
import com.astrawatch.orchestrator.application.service.RunbookService;
import com.astrawatch.orchestrator.domain.model.Runbook;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/runbooks")
@RequiredArgsConstructor
public class RunbookController {

    private final RunbookService runbookService;
    private final ObjectMapper objectMapper;

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRunbooks(@RequestParam(required = false) UUID serviceId) {
        List<Runbook> runbooks = serviceId != null
                ? runbookService.getRunbooks(serviceId)
                : runbookService.getAllRunbooks();
        List<RunbookDTO> dtos = runbooks.stream().map(RunbookDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of("runbooks", dtos)));
    }

    /**
     * Creates a runbook. The frontend sends steps/tags as JSON arrays and calls
     * the severity field `severity` — neither maps 1:1 onto the entity's
     * String steps/tags + actionType (audit: create always 500'd or silently
     * lost steps). We accept the raw map and normalize: arrays → JSON strings,
     * severity → actionType.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> createRunbook(@RequestBody Map<String, Object> body) {
        try {
            Runbook runbook = fromBody(body);
            Runbook saved = runbookService.createRunbook(runbook);
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(ApiResponse.created(Map.of(
                            "id", saved.getId().toString(),
                            "title", saved.getTitle(),
                            "serviceId", saved.getServiceId() != null ? saved.getServiceId().toString() : null)));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(new ApiResponse<>(
                    false, Map.of("error", e.getMessage()), Map.of()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateRunbook(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        try {
            Runbook runbook = fromBody(body);
            Runbook saved = runbookService.updateRunbook(id, runbook);
            return ResponseEntity.ok(ApiResponse.ok(Map.of(
                    "id", saved.getId().toString(),
                    "title", saved.getTitle(),
                    "serviceId", saved.getServiceId() != null ? saved.getServiceId().toString() : null)));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(new ApiResponse<>(
                    false, Map.of("error", e.getMessage()), Map.of()));
        }
    }

    @GetMapping("/{id}/versions")
    public ResponseEntity<ApiResponse<List<RunbookVersionDTO>>> getVersions(@PathVariable UUID id) {
        List<RunbookVersionDTO> dtos = runbookService.getVersions(id)
                .stream().map(RunbookVersionDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(dtos));
    }

    @PostMapping("/{id}/execute")
    public ResponseEntity<ApiResponse<Map<String, Object>>> executeRunbook(@PathVariable UUID id,
                                                                            @RequestBody Map<String, Object> body) {
        String executionId = runbookService.executeRunbook(id, body);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(ApiResponse.accepted(Map.of("executionId", executionId)));
    }

    @GetMapping("/{id}/executions")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getExecutions(@PathVariable UUID id) {
        List<Map<String, Object>> executions = runbookService.getExecutions(id);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("executions", executions)));
    }

    /** Normalizes the frontend's { title, severity, steps: [...], tags: [...] } into the entity. */
    private Runbook fromBody(Map<String, Object> body) {
        Runbook rb = new Runbook();
        if (body.get("title") != null) rb.setTitle(String.valueOf(body.get("title")));
        if (body.get("description") != null) rb.setDescription(String.valueOf(body.get("description")));
        // steps: array of strings (frontend) or a JSON string (direct API).
        rb.setSteps(toJsonString(body.get("steps")));
        // tags: array or comma-separated string.
        rb.setTags(toJsonString(body.get("tags")));
        // severity (frontend) maps to actionType.
        Object severity = body.get("severity");
        Object actionType = body.get("actionType");
        if (actionType != null) {
            rb.setActionType(String.valueOf(actionType));
        } else if (severity != null) {
            rb.setActionType(String.valueOf(severity));
        }
        if (body.get("serviceId") != null) {
            try {
                rb.setServiceId(UUID.fromString(String.valueOf(body.get("serviceId"))));
            } catch (IllegalArgumentException ignored) {
                // catalog key or empty — leave null
            }
        }
        rb.setCurrentRevision(1);
        return rb;
    }

    private String toJsonString(Object value) {
        if (value == null) return "[]";
        if (value instanceof String s) {
            String t = s.trim();
            if (t.startsWith("[")) return t; // already JSON
            // Newline-separated steps (direct API callers); comma-separated tags.
            if (t.contains("\n")) return toJsonArray(t.split("\n"));
            return toJsonArray(t.split(","));
        }
        if (value instanceof List<?> list) {
            return toJsonArray(list.stream().map(String::valueOf).toArray(String[]::new));
        }
        return "[]";
    }

    private String toJsonArray(String[] parts) {
        try {
            java.util.List<String> trimmed = new java.util.ArrayList<>();
            for (String p : parts) {
                String t = p.trim();
                if (!t.isEmpty()) trimmed.add(t);
            }
            return objectMapper.writeValueAsString(trimmed);
        } catch (Exception e) {
            return "[]";
        }
    }
}
