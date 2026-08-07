package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.in.web.dto.MaintenanceWindowDTO;
import com.astrawatch.orchestrator.adapter.in.web.dto.NotificationChannelDTO;
import com.astrawatch.orchestrator.adapter.in.web.dto.NotificationPreferenceDTO;
import com.astrawatch.orchestrator.adapter.in.web.dto.NotificationRuleDTO;
import com.astrawatch.orchestrator.application.service.NotificationService;
import com.astrawatch.orchestrator.infrastructure.security.OrgContextResolver;
import com.astrawatch.orchestrator.domain.model.MaintenanceWindow;
import com.astrawatch.orchestrator.domain.model.NotificationChannel;
import com.astrawatch.orchestrator.domain.model.NotificationRule;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;
    private final JdbcTemplate jdbcTemplate;
    private final OrgContextResolver orgContextResolver;

    /**
     * Recent notification history (incident + healing events) so the header bell
     * survives a page refresh — live WebSocket events alone are ephemeral.
     * Read state stays client-side; the ids are shaped so history items dedupe
     * against the WS push ids (incident.created -> incident UUID, healing ->
     * action UUID).
     */
    @GetMapping("/history")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getHistory(@RequestParam(defaultValue = "30") int limit) {
        int capped = Math.min(Math.max(limit, 1), 100);
        List<Map<String, Object>> items = new ArrayList<>();

        // Incident events (with the incident title for a human-readable subject).
        jdbcTemplate.query(
                "SELECT ie.id, ie.event_type, ie.incident_id, ie.created_at, COALESCE(i.title, 'Incident') AS title " +
                        "FROM incident_events ie LEFT JOIN incidents i ON i.id = ie.incident_id " +
                        "ORDER BY ie.created_at DESC LIMIT ?",
                rs -> {
                    String eventType = rs.getString("event_type");
                    String incidentId = rs.getString("incident_id");
                    String notifType = "incident.created".equals(eventType)
                            ? "incident.created"
                            : "incident.updated";
                    // incident.created matches the WS push id (incident UUID);
                    // other events get a unique row-scoped id.
                    String id = "incident.created".equals(eventType)
                            ? incidentId
                            : incidentId + "-" + eventType + "-" + rs.getLong("id");
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", id);
                    row.put("type", notifType);
                    row.put("title", titleFor(eventType, rs.getString("title")));
                    row.put("time", rs.getTimestamp("created_at").toInstant().toString());
                    row.put("link", "/incidents/" + incidentId);
                    items.add(row);
                },
                capped);

        // Healing actions (execution-plane outcomes the UI surfaces as notifications).
        jdbcTemplate.query(
                "SELECT id, incident_id, action_type, status, created_at " +
                        "FROM healing_actions ORDER BY created_at DESC LIMIT ?",
                rs -> {
                    String actionId = rs.getString("id");
                    String incidentId = rs.getString("incident_id");
                    String status = rs.getString("status");
                    String type = healingType(status);
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", actionId); // matches the WS healing push id
                    row.put("type", type);
                    row.put("title", "Healing " + rs.getString("action_type") + ": " + status.toLowerCase());
                    row.put("time", rs.getTimestamp("created_at").toInstant().toString());
                    row.put("link", incidentId != null ? "/incidents/" + incidentId : "/healing");
                    items.add(row);
                },
                capped);

        // Merge both sources, newest first. `items` is only mutated (sorted) —
        // never reassigned — so it stays effectively final for the lambdas above.
        items.sort((a, b) -> Instant.parse((String) b.get("time")).compareTo(Instant.parse((String) a.get("time"))));
        List<Map<String, Object>> result = items.size() > capped
                ? new ArrayList<>(items.subList(0, capped))
                : items;
        return ResponseEntity.ok(ApiResponse.ok(Map.of("items", result)));
    }

    private static String titleFor(String eventType, String fallback) {
        if (eventType == null) return fallback;
        return switch (eventType) {
            case "incident.created" -> fallback + " created";
            case "incident.resolved" -> fallback + " resolved";
            case "incident.escalated" -> fallback + " escalated";
            case "incident.assigned" -> fallback + " assigned";
            case "incident.comment" -> fallback + " — new comment";
            case "incident.state_changed" -> fallback + " state changed";
            default -> fallback;
        };
    }

    private static String healingType(String status) {
        if (status == null) return "healing.started";
        return switch (status.toUpperCase()) {
            case "COMPLETED" -> "healing.completed";
            case "FAILED", "ROLLED_BACK" -> "healing.failed";
            default -> "healing.started";
        };
    }

    @GetMapping("/channels")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getChannels(@RequestParam(required = false) UUID orgId) {
        orgId = orgContextResolver.resolve(orgId);
        List<NotificationChannelDTO> dtos = notificationService.getChannels(orgId)
                .stream().map(NotificationChannelDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of("channels", dtos)));
    }

    @PostMapping("/channels")
    public ResponseEntity<ApiResponse<NotificationChannelDTO>> createChannel(@RequestBody NotificationChannel channel) {
        // The frontend omits orgId; stamp the authenticated user's org so the
        // channel is visible under the org-scoped GET (review fix: without this,
        // channels created from the UI had orgId = null and disappeared after
        // org-context resolution).
        if (channel.getOrgId() == null) {
            UUID org = orgContextResolver.resolveFromPrincipal();
            if (org == null) {
                @SuppressWarnings("unchecked")
                ApiResponse<NotificationChannelDTO> err = (ApiResponse<NotificationChannelDTO>) (ApiResponse<?>) new ApiResponse<>(
                        false, Map.of("error", "No organization context for this user — join a team before creating channels"), Map.of());
                return ResponseEntity.badRequest().body(err);
            }
            channel.setOrgId(org);
        }
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
        // Audit fix: this previously returned a fabricated success. Now it actually
        // dispatches a test payload through the channel adapter and reports the
        // real HTTP result (or a clear failure when the channel is misconfigured).
        Map<String, Object> result = notificationService.testChannelDelivery(id);
        boolean delivered = Boolean.TRUE.equals(result.get("delivered"));
        HttpStatus status = delivered ? HttpStatus.OK : HttpStatus.BAD_GATEWAY;
        return ResponseEntity.status(status).body(new ApiResponse<>(delivered, result, Map.of()));
    }

    @GetMapping("/rules")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRules(@RequestParam(required = false) UUID orgId) {
        orgId = orgContextResolver.resolve(orgId);
        List<NotificationRuleDTO> dtos = notificationService.getRules(orgId)
                .stream().map(NotificationRuleDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of("rules", dtos)));
    }

    @PostMapping("/rules")
    public ResponseEntity<ApiResponse<NotificationRuleDTO>> createRule(@RequestBody NotificationRule rule) {
        if (rule.getOrgId() == null) {
            UUID org = orgContextResolver.resolveFromPrincipal();
            if (org == null) {
                @SuppressWarnings("unchecked")
                ApiResponse<NotificationRuleDTO> err = (ApiResponse<NotificationRuleDTO>) (ApiResponse<?>) new ApiResponse<>(
                        false, Map.of("error", "No organization context for this user — join a team before creating rules"), Map.of());
                return ResponseEntity.badRequest().body(err);
            }
            rule.setOrgId(org);
        }
        NotificationRuleDTO dto = NotificationRuleDTO.from(notificationService.createRule(rule));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(dto));
    }

    @PutMapping("/rules/{id}/toggle")
    public ResponseEntity<ApiResponse<NotificationRuleDTO>> toggleRule(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        boolean enabled = body.get("enabled") == null || Boolean.TRUE.equals(body.get("enabled"));
        return notificationService.setRuleEnabled(id, enabled)
                .map(r -> ResponseEntity.ok(ApiResponse.ok(NotificationRuleDTO.from(r))))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/rules/{id}/test")
    public ResponseEntity<ApiResponse<Map<String, Object>>> testRule(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        // Audit fix: previously returned a fabricated match/delivery summary.
        Map<String, Object> result = notificationService.testRuleDelivery(id);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/maintenance-windows")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getMaintenanceWindows(@RequestParam(required = false) UUID orgId,
                                                                                   @RequestParam(required = false) Boolean active) {
        orgId = orgContextResolver.resolve(orgId);
        List<MaintenanceWindowDTO> dtos = notificationService.getMaintenanceWindows(orgId)
                .stream().map(MaintenanceWindowDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of("windows", dtos)));
    }

    @PostMapping("/maintenance-windows")
    public ResponseEntity<ApiResponse<MaintenanceWindowDTO>> createMaintenanceWindow(@RequestBody MaintenanceWindow window) {
        if (window.getOrgId() == null) {
            UUID org = orgContextResolver.resolveFromPrincipal();
            if (org == null) {
                @SuppressWarnings("unchecked")
                ApiResponse<MaintenanceWindowDTO> err = (ApiResponse<MaintenanceWindowDTO>) (ApiResponse<?>) new ApiResponse<>(
                        false, Map.of("error", "No organization context for this user — join a team before creating maintenance windows"), Map.of());
                return ResponseEntity.badRequest().body(err);
            }
            window.setOrgId(org);
        }
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

    @PostMapping("/unsubscribe")
    public ResponseEntity<ApiResponse<Map<String, Object>>> unsubscribe(@RequestBody Map<String, String> body) {
        String token = body.get("token");
        boolean success = notificationService.unsubscribe(token);
        if (success) {
            return ResponseEntity.ok(ApiResponse.ok(Map.of("unsubscribed", true)));
        } else {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(new ApiResponse<>(false, Map.of("error", "Invalid or expired unsubscribe token"), Map.of()));
        }
    }
}
