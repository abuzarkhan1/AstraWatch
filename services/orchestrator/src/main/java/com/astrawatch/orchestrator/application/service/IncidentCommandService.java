package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.adapter.out.kafka.KafkaEventProducer;
import com.astrawatch.orchestrator.domain.model.Incident;
import com.astrawatch.orchestrator.domain.model.IncidentEvent;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentEventRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class IncidentCommandService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(IncidentCommandService.class);

    private final IncidentRepository incidentRepository;
    private final IncidentEventRepository eventRepository;
    private final KafkaEventProducer kafkaEventProducer;
    private final UserRepository userRepository;

    @Transactional
    public Incident createIncident(UUID serviceId, UUID anomalyId, Incident.Severity severity, String title, String description) {
        return createIncident(serviceId, anomalyId, severity, title, description, "default");
    }

    public Incident createIncident(UUID serviceId, UUID anomalyId, Incident.Severity severity, String title, String description, String tenantId) {
        Incident incident = Incident.builder()
                .serviceId(serviceId)
                .anomalyId(anomalyId)
                .severity(severity)
                .state(Incident.IncidentState.DETECTED)
                .title(title)
                .description(description)
                .tenantId(tenantId != null ? tenantId : "default")
                .build();

        incident = incidentRepository.save(incident);

        addEvent(incident.getId(), "incident.created", String.format(
                "{\"severity\":\"%s\",\"serviceId\":\"%s\"}", severity, serviceId));

        // Publish incident-created to Kafka (audit: the realtime gateway subscribed
        // to incident-* but no producer existed — the UI toasts never fired). The
        // realtime consumer maps this topic to incident.created and broadcasts it
        // to the tenant's dashboard room. tenantId is the incident's REAL tenant
        // (audit: this was hardcoded "default", so pushes went to tenant:default:*
        // while the demo admin sits in tenant:<team-uuid>:* — toasts never arrived).
        Map<String, Object> createdEvent = new LinkedHashMap<>();
        createdEvent.put("incidentId", incident.getId().toString());
        createdEvent.put("serviceId", serviceId != null ? serviceId.toString() : null);
        createdEvent.put("anomalyId", anomalyId != null ? anomalyId.toString() : null);
        createdEvent.put("severity", severity != null ? severity.name() : null);
        createdEvent.put("state", incident.getState() != null ? incident.getState().name() : null);
        createdEvent.put("title", title);
        createdEvent.put("description", description);
        createdEvent.put("createdAt", incident.getCreatedAt() != null ? incident.getCreatedAt().toString() : Instant.now().toString());
        createdEvent.put("tenantId", incident.getTenantId() != null ? incident.getTenantId() : "default");
        kafkaEventProducer.publish("incident-created", incident.getId().toString(), createdEvent);

        log.info("Incident created: id={}, serviceId={}, severity={}, tenant={}", incident.getId(), serviceId, severity, incident.getTenantId());
        return incident;
    }

    /** Resolve the tenant (team UUID) for a user — used when manually creating incidents. */
    public String resolveTenantForUser(UUID userId) {
        if (userId == null || userRepository == null) return "default";
        try {
            return userRepository.findById(userId)
                    .map(u -> u.getTeamId() != null ? u.getTeamId().toString() : "default")
                    .orElse("default");
        } catch (Exception e) {
            return "default";
        }
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

        // Publish incident-updated so the dashboard's Recent Incidents refreshes
        // via push (audit: incident-updated had no producer either).
        Map<String, Object> updatedEvent = new LinkedHashMap<>();
        updatedEvent.put("incidentId", incidentId.toString());
        updatedEvent.put("serviceId", incident.getServiceId() != null ? incident.getServiceId().toString() : null);
        updatedEvent.put("severity", incident.getSeverity() != null ? incident.getSeverity().name() : null);
        updatedEvent.put("state", newState != null ? newState.name() : null);
        updatedEvent.put("fromState", oldState != null ? oldState.name() : null);
        updatedEvent.put("title", incident.getTitle());
        updatedEvent.put("updatedAt", Instant.now().toString());
        updatedEvent.put("tenantId", incident.getTenantId() != null ? incident.getTenantId() : "default");
        kafkaEventProducer.publish("incident-updated", incidentId.toString(), updatedEvent);

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
    public List<Incident> listAllIncidents() {
        return incidentRepository.findAll(
                org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC, "createdAt"));
    }

    @Transactional(readOnly = true)
    public List<IncidentEvent> getIncidentTimeline(UUID incidentId) {
        return eventRepository.findByIncidentIdOrderByCreatedAtAsc(incidentId);
    }
}
