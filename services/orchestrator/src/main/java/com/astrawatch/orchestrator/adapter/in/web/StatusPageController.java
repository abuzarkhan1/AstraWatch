package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.in.web.dto.StatusPageComponentDTO;
import com.astrawatch.orchestrator.adapter.in.web.dto.StatusPageMaintenanceDTO;
import com.astrawatch.orchestrator.adapter.in.web.dto.StatusPageSubscriberDTO;
import com.astrawatch.orchestrator.application.service.StatusPageService;
import com.astrawatch.orchestrator.domain.model.StatusPageComponent;
import com.astrawatch.orchestrator.domain.model.StatusPageMaintenance;
import com.astrawatch.orchestrator.domain.model.StatusPageSubscriber;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/status-page")
@RequiredArgsConstructor
public class StatusPageController {

    private final StatusPageService statusPageService;

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStatusPage(@RequestParam(required = false) UUID orgId) {
        List<StatusPageComponentDTO> components = statusPageService.getComponents(orgId)
                .stream().map(StatusPageComponentDTO::from).toList();
        List<StatusPageMaintenanceDTO> maintenances = statusPageService.getMaintenances(orgId)
                .stream().map(StatusPageMaintenanceDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "components", components,
                "incidents", List.of(),
                "uptime", 99.9,
                "maintenances", maintenances
        )));
    }

    @PostMapping("/components")
    public ResponseEntity<ApiResponse<StatusPageComponentDTO>> createComponent(@RequestBody StatusPageComponent component) {
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
        List<StatusPageSubscriberDTO> dtos = statusPageService.getSubscribers(orgId)
                .stream().map(StatusPageSubscriberDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of("subscribers", dtos)));
    }

    @PostMapping("/subscribers")
    public ResponseEntity<ApiResponse<StatusPageSubscriberDTO>> createSubscriber(@RequestBody StatusPageSubscriber subscriber) {
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
        StatusPageMaintenanceDTO dto = StatusPageMaintenanceDTO.from(statusPageService.createMaintenance(maintenance));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(dto));
    }
}
