package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.in.web.dto.StatusPageComponentDTO;
import com.astrawatch.orchestrator.adapter.in.web.dto.StatusPageMaintenanceDTO;
import com.astrawatch.orchestrator.adapter.in.web.dto.StatusPageSubscriberDTO;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.application.service.StatusPageService;
import com.astrawatch.orchestrator.infrastructure.security.OrgContextResolver;
import com.astrawatch.orchestrator.domain.model.Incident;
import com.astrawatch.orchestrator.domain.model.StatusPageComponent;
import com.astrawatch.orchestrator.domain.model.StatusPageMaintenance;
import com.astrawatch.orchestrator.domain.model.StatusPageSubscriber;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/status-page")
@RequiredArgsConstructor
public class StatusPageController {

    private final StatusPageService statusPageService;
    private final IncidentRepository incidentRepository;
    private final OrgContextResolver orgContextResolver;

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStatusPage(@RequestParam(required = false) UUID orgId) {
        // Resolve the user's org when the frontend omits orgId (it always does).
        UUID org = orgContextResolver.resolve(orgId);
        List<StatusPageComponentDTO> components = statusPageService.getComponents(org)
                .stream().map(StatusPageComponentDTO::from).toList();
        List<StatusPageMaintenanceDTO> maintenances = statusPageService.getMaintenances(org)
                .stream().map(StatusPageMaintenanceDTO::from).toList();
        // Audit fix: the incidents feed was hardcoded empty. Now it surfaces real
        // active incidents plus anything resolved in the last 90 days so the
        // status page reflects actual operational state.
        List<Map<String, Object>> incidents = new ArrayList<>();
        Instant cutoff = Instant.now().minusSeconds(90L * 24 * 60 * 60);
        for (Incident inc : incidentRepository.findAll()) {
            Instant created = inc.getCreatedAt() != null ? inc.getCreatedAt() : Instant.EPOCH;
            if (inc.getState() != Incident.IncidentState.RESOLVED || created.isAfter(cutoff)) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", inc.getId() != null ? inc.getId().toString() : null);
                row.put("title", inc.getTitle());
                row.put("serviceId", inc.getServiceId() != null ? inc.getServiceId().toString() : null);
                row.put("severity", inc.getSeverity() != null ? inc.getSeverity().name() : null);
                row.put("state", inc.getState() != null ? inc.getState().name() : null);
                row.put("createdAt", inc.getCreatedAt() != null ? inc.getCreatedAt().toString() : null);
                row.put("resolvedAt", inc.getResolvedAt() != null ? inc.getResolvedAt().toString() : null);
                incidents.add(row);
            }
        }
        // LinkedHashMap (not Map.of): uptime may legitimately be null when no
        // components are registered, and Map.of throws NPE on null values.
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("components", components);
        body.put("incidents", incidents);
        body.put("uptime", computeUptime(components));
        body.put("maintenances", maintenances);
        return ResponseEntity.ok(ApiResponse.ok(body));
    }

    private static Double computeUptime(List<StatusPageComponentDTO> components) {
        // Honest uptime: null when no components are registered — claiming 100%
        // availability for an unmonitored system was fabricated data (audit fix).
        if (components == null || components.isEmpty()) return null;
        long healthy = components.stream()
                .filter(c -> "HEALTHY".equals(c.status()))
                .count();
        return Math.round((healthy * 1000.0) / components.size()) / 10.0;
    }

    @PostMapping("/components")
    public ResponseEntity<ApiResponse<StatusPageComponentDTO>> createComponent(@RequestBody StatusPageComponent component) {
        if (component.getOrgId() == null) {
            UUID org = orgContextResolver.resolveFromPrincipal();
            if (org == null) {
                // Raw ApiResponse (unchecked) so the error payload type-checks
                // against the DTO-typed ResponseEntity return.
                @SuppressWarnings("unchecked")
                ApiResponse<StatusPageComponentDTO> err = (ApiResponse<StatusPageComponentDTO>) (ApiResponse<?>) new ApiResponse<>(
                        false, Map.of("error", "No organization context for this user — join a team before adding components"), Map.of());
                return ResponseEntity.badRequest().body(err);
            }
            component.setOrgId(org);
        }
        StatusPageComponentDTO dto = StatusPageComponentDTO.from(statusPageService.createComponent(component));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(dto));
    }

    @PutMapping("/components/{id}/status")
    public ResponseEntity<ApiResponse<StatusPageComponentDTO>> updateComponentStatus(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        return statusPageService.updateComponentStatus(id, body.get("status"))
                .map(c -> ResponseEntity.ok(ApiResponse.ok(StatusPageComponentDTO.from(c))))
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/subscribers")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getSubscribers(@RequestParam(required = false) UUID orgId) {
        UUID org = orgContextResolver.resolve(orgId);
        List<StatusPageSubscriberDTO> dtos = statusPageService.getSubscribers(org)
                .stream().map(StatusPageSubscriberDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of("subscribers", dtos)));
    }

    @PostMapping("/subscribers")
    public ResponseEntity<ApiResponse<StatusPageSubscriberDTO>> createSubscriber(@RequestBody StatusPageSubscriber subscriber) {
        if (subscriber.getOrgId() == null) {
            UUID org = orgContextResolver.resolveFromPrincipal();
            if (org == null) {
                @SuppressWarnings("unchecked")
                ApiResponse<StatusPageSubscriberDTO> err = (ApiResponse<StatusPageSubscriberDTO>) (ApiResponse<?>) new ApiResponse<>(
                        false, Map.of("error", "No organization context for this user — join a team before adding subscribers"), Map.of());
                return ResponseEntity.badRequest().body(err);
            }
            subscriber.setOrgId(org);
        }
        StatusPageSubscriberDTO dto = StatusPageSubscriberDTO.from(statusPageService.createSubscriber(subscriber));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(dto));
    }

    @DeleteMapping("/subscribers/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteSubscriber(@PathVariable UUID id) {
        statusPageService.deleteSubscriber(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/maintenance")
    public ResponseEntity<ApiResponse<StatusPageMaintenanceDTO>> createMaintenance(@RequestBody StatusPageMaintenance maintenance) {
        if (maintenance.getOrgId() == null) {
            UUID org = orgContextResolver.resolveFromPrincipal();
            if (org == null) {
                @SuppressWarnings("unchecked")
                ApiResponse<StatusPageMaintenanceDTO> err = (ApiResponse<StatusPageMaintenanceDTO>) (ApiResponse<?>) new ApiResponse<>(
                        false, Map.of("error", "No organization context for this user — join a team before scheduling maintenance"), Map.of());
                return ResponseEntity.badRequest().body(err);
            }
            maintenance.setOrgId(org);
        }
        StatusPageMaintenanceDTO dto = StatusPageMaintenanceDTO.from(statusPageService.createMaintenance(maintenance));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(dto));
    }
}
