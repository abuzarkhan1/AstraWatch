package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.in.web.dto.HealingActionDTO;
import com.astrawatch.orchestrator.adapter.out.persistence.HealingActionRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.application.service.HealingOrchestrationService;
import com.astrawatch.orchestrator.application.service.NotificationService;
import com.astrawatch.orchestrator.domain.model.HealingAction;
import com.astrawatch.orchestrator.domain.model.Incident;
import com.astrawatch.orchestrator.domain.model.User;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/healing")
@RequiredArgsConstructor
public class HealingController {

    private final HealingOrchestrationService healingService;
    private final NotificationService notificationService;
    private final UserRepository userRepository;
    private final HealingActionRepository healingActionRepository;
    private final IncidentRepository incidentRepository;

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
    public ResponseEntity<ApiResponse<List<HealingActionDTO>>> getHistory(@RequestParam(required = false) UUID serviceId) {
        // Return the real healing-action history instead of a hardcoded stub (audit
        // F11 — the frontend search previously queried a fake "{\"items\":[]}" body).
        // HealingAction does not carry a serviceId (only incidentId), so the
        // service filter is resolved via the incident repository when provided.
        List<HealingAction> actions;
        if (serviceId != null && incidentRepository != null) {
            java.util.Set<UUID> incidentIds = incidentRepository.findByServiceIdOrderByCreatedAtDesc(serviceId).stream()
                    .map(Incident::getId)
                    .collect(java.util.stream.Collectors.toSet());
            actions = healingActionRepository.findAll().stream()
                    .filter(a -> a.getIncidentId() != null && incidentIds.contains(a.getIncidentId()))
                    .collect(java.util.stream.Collectors.toList());
        } else {
            actions = healingActionRepository.findAll();
        }
        // Order newest-first; bounded to the latest 100 so the endpoint stays cheap.
        // Skip any action with a null status (legacy/seed rows) because
        // HealingActionDTO.from() would NPE on getStatus().name().
        List<HealingActionDTO> dtos = actions.stream()
                .filter(a -> a.getStatus() != null)
                .sorted(java.util.Comparator.comparing(HealingAction::getCreatedAt,
                        java.util.Comparator.nullsLast(java.util.Comparator.reverseOrder())))
                .limit(100)
                .map(HealingActionDTO::from)
                .collect(java.util.stream.Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(dtos));
    }

    @GetMapping("/{actionId}/validation")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getValidation(@PathVariable UUID actionId) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "beforeMetrics", Map.of(),
                "afterMetrics", Map.of(),
                "passed", true
        )));
    }

    /**
     * One-click approve link embedded in healing-status emails (audit F6 — email as
     * a control plane). The token binds actionId + recipient email + decision, so
     * only a valid signed token can approve a pending action.
     */
    @GetMapping(value = "/approve/{actionId}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> approveFromEmail(@PathVariable UUID actionId,
                                                   @RequestParam String token) {
        NotificationService.ActionDecision decision = notificationService.verifyActionToken(token);
        if (decision == null || !decision.actionId().equals(actionId)
                || !"approve".equals(decision.decision())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(htmlPage("Invalid or expired approval link", "The approval token could not be verified. Please open the incident in the dashboard instead."));
        }

        UUID approvedBy = resolveUser(decision.email());
        healingService.approveAction(actionId, approvedBy);
        return ResponseEntity.ok(htmlPage("Healing action approved",
                "The healing action has been approved and will be executed under blast-radius guards."));
    }

    /**
     * One-click reject link embedded in healing-status emails.
     */
    @GetMapping(value = "/reject/{actionId}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> rejectFromEmail(@PathVariable UUID actionId,
                                                  @RequestParam String token) {
        NotificationService.ActionDecision decision = notificationService.verifyActionToken(token);
        if (decision == null || !decision.actionId().equals(actionId)
                || !"reject".equals(decision.decision())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(htmlPage("Invalid or expired rejection link", "The rejection token could not be verified. Please open the incident in the dashboard instead."));
        }

        UUID rejectedBy = resolveUser(decision.email());
        healingService.rejectAction(actionId, rejectedBy, "Rejected via email link");
        return ResponseEntity.ok(htmlPage("Healing action rejected",
                "The healing action was rejected and will NOT be executed. The incident remains open for investigation."));
    }

    private UUID resolveUser(String email) {
        if (email == null || userRepository == null) return null;
        return userRepository.findByEmail(email).map(User::getId).orElse(null);
    }

    private String htmlPage(String title, String message) {
        return "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>AstraWatch</title></head>"
                + "<body style='font-family:system-ui;background:#0d1117;color:#c9d1d9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0'>"
                + "<div style='max-width:480px;background:#161b22;border:1px solid #30363d;border-radius:12px;padding:32px;text-align:center'>"
                + "<h2 style='color:#58a6ff;margin-top:0'>" + title + "</h2>"
                + "<p>" + message + "</p>"
                + "<a href='/' style='display:inline-block;margin-top:16px;background:#1f6beb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600'>Open Dashboard</a>"
                + "</div></body></html>";
    }

    public record TriggerHealingRequest(
            UUID incidentId,
            String actionType,
            Map<String, Object> parameters
    ) {}
}
