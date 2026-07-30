package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.in.web.dto.RunbookDTO;
import com.astrawatch.orchestrator.adapter.in.web.dto.RunbookVersionDTO;
import com.astrawatch.orchestrator.application.service.RunbookService;
import com.astrawatch.orchestrator.domain.model.Runbook;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/runbooks")
@RequiredArgsConstructor
public class RunbookController {

    private final RunbookService runbookService;

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRunbooks(@RequestParam(required = false) UUID serviceId) {
        List<Runbook> runbooks = serviceId != null
                ? runbookService.getRunbooks(serviceId)
                : List.of();
        List<RunbookDTO> dtos = runbooks.stream().map(RunbookDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of("runbooks", dtos)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<RunbookDTO>> createRunbook(@RequestBody Runbook runbook) {
        RunbookDTO dto = RunbookDTO.from(runbookService.createRunbook(runbook));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(dto));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<RunbookDTO>> updateRunbook(@PathVariable UUID id, @RequestBody Runbook runbook) {
        RunbookDTO dto = RunbookDTO.from(runbookService.updateRunbook(id, runbook));
        return ResponseEntity.ok(ApiResponse.ok(dto));
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
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(ApiResponse.accepted());
    }

    @GetMapping("/{id}/executions")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getExecutions(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("executions", List.of())));
    }
}
