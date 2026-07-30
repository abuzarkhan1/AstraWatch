package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.Incident;

import java.time.Instant;
import java.util.UUID;

public record IncidentDTO(
        UUID id, UUID serviceId, UUID anomalyId, String severity, String state,
        String title, String description, UUID assignedTo,
        String rootCause, String resolutionNote,
        Instant createdAt, Instant updatedAt, Instant resolvedAt
) {
    public static IncidentDTO from(Incident i) {
        return new IncidentDTO(i.getId(), i.getServiceId(), i.getAnomalyId(),
                i.getSeverity().name(), i.getState().name(), i.getTitle(),
                i.getDescription(), i.getAssignedTo(), i.getRootCause(),
                i.getResolutionNote(), i.getCreatedAt(), i.getUpdatedAt(), i.getResolvedAt());
    }
}
