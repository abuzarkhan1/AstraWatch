package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.MaintenanceWindow;

import java.time.Instant;
import java.util.UUID;

public record MaintenanceWindowDTO(
        UUID id, UUID orgId, String serviceIds, String reason,
        Instant startedAt, Instant endedAt, UUID createdBy, Instant createdAt
) {
    public static MaintenanceWindowDTO from(MaintenanceWindow w) {
        return new MaintenanceWindowDTO(w.getId(), w.getOrgId(), w.getServiceIds(),
                w.getReason(), w.getStartedAt(), w.getEndedAt(),
                w.getCreatedBy(), w.getCreatedAt());
    }
}
