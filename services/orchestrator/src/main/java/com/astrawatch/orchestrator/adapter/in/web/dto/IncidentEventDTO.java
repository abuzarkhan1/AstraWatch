package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.IncidentEvent;

import java.time.Instant;
import java.util.UUID;

public record IncidentEventDTO(
        Long id, UUID incidentId, String eventType, String payload, Instant createdAt
) {
    public static IncidentEventDTO from(IncidentEvent e) {
        return new IncidentEventDTO(e.getId(), e.getIncidentId(), e.getEventType(),
                e.getPayload(), e.getCreatedAt());
    }
}
