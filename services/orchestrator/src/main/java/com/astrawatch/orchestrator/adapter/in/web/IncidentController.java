package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.in.web.dto.IncidentDTO;
import com.astrawatch.orchestrator.adapter.in.web.dto.IncidentEventDTO;
import com.astrawatch.orchestrator.application.service.IncidentCommandService;
import com.astrawatch.orchestrator.domain.model.Incident;
import com.astrawatch.orchestrator.domain.model.IncidentLifecycleEvent;
import com.astrawatch.orchestrator.domain.model.IncidentLifecycleState;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.statemachine.StateMachine;
import org.springframework.statemachine.config.StateMachineFactory;
import org.springframework.statemachine.support.DefaultStateMachineContext;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/incidents")
@RequiredArgsConstructor
public class IncidentController {

    private final IncidentCommandService incidentService;
    private final StateMachineFactory<IncidentLifecycleState, IncidentLifecycleEvent> stateMachineFactory;

    @PostMapping
    public ResponseEntity<ApiResponse<IncidentDTO>> createIncident(@RequestBody CreateIncidentRequest request) {
        Incident incident = incidentService.createIncident(
                request.serviceId(),
                request.anomalyId(),
                request.severity(),
                request.title(),
                request.description()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(IncidentDTO.from(incident)));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<IncidentDTO>>> listIncidents(
            @RequestParam(required = false) UUID serviceId) {
        List<Incident> incidents;
        if (serviceId != null) {
            incidents = incidentService.getIncidentsByService(serviceId);
        } else {
            incidents = List.of();
        }
        List<IncidentDTO> dtos = incidents.stream().map(IncidentDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(dtos));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<IncidentDTO>> getIncident(@PathVariable UUID id) {
        return incidentService.getIncident(id)
                .map(i -> ResponseEntity.ok(ApiResponse.ok(IncidentDTO.from(i))))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/assign")
    public ResponseEntity<ApiResponse<IncidentDTO>> assignIncident(@PathVariable UUID id, @RequestBody Map<String, UUID> body) {
        IncidentDTO dto = IncidentDTO.from(incidentService.assignIncident(id, body.get("userId")));
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @PostMapping("/{id}/comment")
    public ResponseEntity<ApiResponse<Void>> addComment(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        incidentService.addComment(id, body.get("text"));
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(ApiResponse.accepted());
    }

    @PostMapping("/{id}/resolve")
    public ResponseEntity<ApiResponse<IncidentDTO>> resolveIncident(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        IncidentDTO dto = IncidentDTO.from(incidentService.resolveIncident(id, body.get("resolutionNote")));
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @PostMapping("/{id}/escalate")
    public ResponseEntity<ApiResponse<IncidentDTO>> escalateIncident(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        IncidentDTO dto = IncidentDTO.from(incidentService.escalateIncident(id, body.get("escalateTo"), body.get("reason")));
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @GetMapping("/{id}/timeline")
    public ResponseEntity<ApiResponse<List<IncidentEventDTO>>> getTimeline(@PathVariable UUID id) {
        List<IncidentEventDTO> dtos = incidentService.getIncidentTimeline(id)
                .stream().map(IncidentEventDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(dtos));
    }

    @PatchMapping("/{id}/transition")
    public ResponseEntity<ApiResponse<IncidentDTO>> transitionIncident(
            @PathVariable UUID id, @RequestBody Map<String, String> body) {
        IncidentLifecycleEvent event = IncidentLifecycleEvent.valueOf(body.get("event"));

        Incident incident = incidentService.getIncident(id)
                .orElseThrow(() -> new IllegalArgumentException("Incident not found: " + id));

        StateMachine<IncidentLifecycleState, IncidentLifecycleEvent> sm = stateMachineFactory.getStateMachine();
        sm.start();

        sm.getStateMachineAccessor().doWithRegion(access ->
                access.resetStateMachine(new DefaultStateMachineContext<>(
                        IncidentLifecycleState.fromIncidentState(incident.getState()), null, null, null)));

        if (!sm.sendEvent(event)) {
            return ResponseEntity.badRequest().body(ApiResponse.ok(null));
        }

        IncidentLifecycleState target = sm.getState().getId();
        Incident updated = incidentService.updateState(id, target.toIncidentState());
        return ResponseEntity.ok(ApiResponse.ok(IncidentDTO.from(updated)));
    }

    public record CreateIncidentRequest(
            UUID serviceId,
            UUID anomalyId,
            Incident.Severity severity,
            String title,
            String description
    ) {}
}
