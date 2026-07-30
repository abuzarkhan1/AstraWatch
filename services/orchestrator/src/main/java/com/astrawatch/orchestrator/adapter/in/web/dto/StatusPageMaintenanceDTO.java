package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.StatusPageMaintenance;

import java.time.Instant;
import java.util.UUID;

public record StatusPageMaintenanceDTO(
        UUID id, UUID orgId, String componentIds, String title,
        String description, Instant scheduledStart, Instant scheduledEnd,
        String status, Instant createdAt
) {
    public static StatusPageMaintenanceDTO from(StatusPageMaintenance m) {
        return new StatusPageMaintenanceDTO(m.getId(), m.getOrgId(), m.getComponentIds(),
                m.getTitle(), m.getDescription(), m.getScheduledStart(),
                m.getScheduledEnd(), m.getStatus(), m.getCreatedAt());
    }
}
