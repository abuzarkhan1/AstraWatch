package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.in.web.dto.HealingActionDTO;
import com.astrawatch.orchestrator.application.service.HealingOrchestrationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/healing")
@RequiredArgsConstructor
public class HealingController {

    private final HealingOrchestrationService healingService;

    @PostMapping("/trigger")
    public ResponseEntity<ApiResponse<HealingActionDTO>> triggerHealing(@RequestBody TriggerHealingRequest request) {
        try {
            HealingActionDTO dto = HealingActionDTO.from(healingService.triggerHealing(
                    request.incidentId(), request.actionType(), request.parameters()));
            return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(dto));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/approve/{actionId}")
    public ResponseEntity<ApiResponse<HealingActionDTO>> approveAction(
            @PathVariable UUID actionId,
            @RequestBody Map<String, UUID> body) {
        HealingActionDTO dto = HealingActionDTO.from(
                healingService.approveAction(actionId, body.get("approvedBy")));
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @PostMapping("/rollback/{actionId}")
    public ResponseEntity<ApiResponse<HealingActionDTO>> rollbackAction(
            @PathVariable UUID actionId,
            @RequestBody Map<String, String> body) {
        HealingActionDTO dto = HealingActionDTO.from(
                healingService.rollbackAction(actionId, body.get("reason")));
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @GetMapping("/history")
    public ResponseEntity<ApiResponse<String>> getHistory(@RequestParam(required = false) UUID serviceId) {
        return ResponseEntity.ok(ApiResponse.of("{\"items\":[]}"));
    }

    @GetMapping("/{actionId}/validation")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getValidation(@PathVariable UUID actionId) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "beforeMetrics", Map.of(),
                "afterMetrics", Map.of(),
                "passed", true
        )));
    }

    public record TriggerHealingRequest(
            UUID incidentId,
            String actionType,
            Map<String, Object> parameters
    ) {}
}
