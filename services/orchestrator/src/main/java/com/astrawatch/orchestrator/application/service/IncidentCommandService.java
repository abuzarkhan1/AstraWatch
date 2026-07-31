package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.domain.model.Incident;
import com.astrawatch.orchestrator.domain.model.IncidentEvent;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class IncidentCommandService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(IncidentCommandService.class);

    private final IncidentRepository incidentRepository;
    private final IncidentEventRepository eventRepository;

    @Transactional
    public Incident createIncident(UUID serviceId, UUID anomalyId, Incident.Severity severity, String title, String description) {
        Incident incident = Incident.builder()
                .serviceId(serviceId)
                .anomalyId(anomalyId)
                .severity(severity)
                .state(Incident.IncidentState.DETECTED)
                .title(title)
                .description(description)
                .build();

        incident = incidentRepository.save(incident);

        addEvent(incident.getId(), "incident.created", String.format(
                "{\"severity\":\"%s\",\"serviceId\":\"%s\"}", severity, serviceId));

        log.info("Incident created: id={}, serviceId={}, severity={}", incident.getId(), serviceId, severity);
        return incident;
    }

    @Transactional
    public Incident updateState(UUID incidentId, Incident.IncidentState newState) {
        Incident incident = incidentRepository.findById(incidentId)
                .orElseThrow(() -> new IllegalArgumentException("Incident not found: " + incidentId));

        Incident.IncidentState oldState = incident.getState();
        incident.setState(newState);

        if (newState == Incident.IncidentState.RESOLVED) {
            incident.setResolvedAt(Instant.now());
        }

        incident = incidentRepository.save(incident);
        addEvent(incidentId, "incident.state_changed",
                String.format("{\"from\":\"%s\",\"to\":\"%s\"}", oldState, newState));

        log.info("Incident {} state changed: {} -> {}", incidentId, oldState, newState);
        return incident;
    }

    @Transactional
    public Incident assignIncident(UUID incidentId, UUID userId) {
        Incident incident = incidentRepository.findById(incidentId)
                .orElseThrow(() -> new IllegalArgumentException("Incident not found: " + incidentId));

        incident.setAssignedTo(userId);
        incident = incidentRepository.save(incident);

        addEvent(incidentId, "incident.assigned",
                String.format("{\"userId\":\"%s\"}", userId));

        log.info("Incident {} assigned to {}", incidentId, userId);
        return incident;
    }

    @Transactional
    public Incident resolveIncident(UUID incidentId, String resolutionNote) {
        Incident incident = updateState(incidentId, Incident.IncidentState.RESOLVED);
        incident.setResolutionNote(resolutionNote);
        incident = incidentRepository.save(incident);

        addEvent(incidentId, "incident.resolved",
                String.format("{\"note\":\"%s\"}", resolutionNote));

        return incident;
    }

    @Transactional
    public Incident escalateIncident(UUID incidentId, String escalateTo, String reason) {
        Incident incident = updateState(incidentId, Incident.IncidentState.ESCALATED);
        addEvent(incidentId, "incident.escalated",
                String.format("{\"escalateTo\":\"%s\",\"reason\":\"%s\"}", escalateTo, reason));
        return incident;
    }

    @Transactional
    public void addComment(UUID incidentId, String text) {
        addEvent(incidentId, "incident.comment",
                String.format("{\"text\":\"%s\"}", text.replace("\"", "'")));
    }

    @Transactional
    public void addEvent(UUID incidentId, String eventType, String payload) {
        IncidentEvent event = IncidentEvent.builder()
                .incidentId(incidentId)
                .eventType(eventType)
                .payload(payload)
                .build();
        eventRepository.save(event);
    }

    @Transactional(readOnly = true)
    public Optional<Incident> getIncident(UUID id) {
        return incidentRepository.findById(id);
    }

    @Transactional(readOnly = true)
    public List<Incident> getIncidentsByService(UUID serviceId) {
        return incidentRepository.findByServiceIdOrderByCreatedAtDesc(serviceId);
    }

    @Transactional(readOnly = true)
    public List<IncidentEvent> getIncidentTimeline(UUID incidentId) {
        return eventRepository.findByIncidentIdOrderByCreatedAtAsc(incidentId);
    }
}
