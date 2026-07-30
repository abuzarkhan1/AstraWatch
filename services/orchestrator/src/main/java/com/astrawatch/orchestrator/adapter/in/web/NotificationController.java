package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.in.web.dto.MaintenanceWindowDTO;
import com.astrawatch.orchestrator.adapter.in.web.dto.NotificationChannelDTO;
import com.astrawatch.orchestrator.adapter.in.web.dto.NotificationPreferenceDTO;
import com.astrawatch.orchestrator.adapter.in.web.dto.NotificationRuleDTO;
import com.astrawatch.orchestrator.application.service.NotificationService;
import com.astrawatch.orchestrator.domain.model.MaintenanceWindow;
import com.astrawatch.orchestrator.domain.model.NotificationChannel;
import com.astrawatch.orchestrator.domain.model.NotificationRule;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping("/channels")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getChannels(@RequestParam(required = false) UUID orgId) {
        List<NotificationChannelDTO> dtos = notificationService.getChannels(orgId)
                .stream().map(NotificationChannelDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of("channels", dtos)));
    }

    @PostMapping("/channels")
    public ResponseEntity<ApiResponse<NotificationChannelDTO>> createChannel(@RequestBody NotificationChannel channel) {
        NotificationChannelDTO dto = NotificationChannelDTO.from(notificationService.createChannel(channel));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(dto));
    }

    @PutMapping("/channels/{id}")
    public ResponseEntity<ApiResponse<NotificationChannelDTO>> updateChannel(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return notificationService.updateChannel(id, body.get("config"))
                .map(c -> ResponseEntity.ok(ApiResponse.ok(NotificationChannelDTO.from(c))))
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/channels/{id}")
    public ResponseEntity<Void> deleteChannel(@PathVariable UUID id) {
        notificationService.deleteChannel(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/channels/{id}/test")
    public ResponseEntity<ApiResponse<Map<String, Object>>> testChannel(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("delivered", true, "responseCode", 200)));
    }

    @GetMapping("/rules")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRules(@RequestParam(required = false) UUID orgId) {
        List<NotificationRuleDTO> dtos = notificationService.getRules(orgId)
                .stream().map(NotificationRuleDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of("rules", dtos)));
    }

    @PostMapping("/rules")
    public ResponseEntity<ApiResponse<NotificationRuleDTO>> createRule(@RequestBody NotificationRule rule) {
        NotificationRuleDTO dto = NotificationRuleDTO.from(notificationService.createRule(rule));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(dto));
    }

    @PostMapping("/rules/{id}/test")
    public ResponseEntity<ApiResponse<Map<String, Object>>> testRule(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("matchedChannels", List.of(), "deliveries", List.of())));
    }

    @GetMapping("/maintenance-windows")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getMaintenanceWindows(@RequestParam(required = false) UUID orgId,
                                                                                   @RequestParam(required = false) Boolean active) {
        List<MaintenanceWindowDTO> dtos = notificationService.getMaintenanceWindows(orgId)
                .stream().map(MaintenanceWindowDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of("windows", dtos)));
    }

    @PostMapping("/maintenance-windows")
    public ResponseEntity<ApiResponse<MaintenanceWindowDTO>> createMaintenanceWindow(@RequestBody MaintenanceWindow window) {
        MaintenanceWindowDTO dto = MaintenanceWindowDTO.from(notificationService.createMaintenanceWindow(window));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(dto));
    }

    @DeleteMapping("/maintenance-windows/{id}")
    public ResponseEntity<Void> deleteMaintenanceWindow(@PathVariable UUID id) {
        notificationService.deleteMaintenanceWindow(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/preferences")
    public ResponseEntity<ApiResponse<List<NotificationPreferenceDTO>>> getPreferences(@RequestParam UUID userId) {
        List<NotificationPreferenceDTO> dtos = notificationService.getPreferences(userId)
                .stream().map(NotificationPreferenceDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(dtos));
    }

    @PutMapping("/preferences")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updatePreferences(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("preferences", body)));
    }
}
