package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.Runbook;

import java.time.Instant;
import java.util.UUID;

public record RunbookDTO(
        UUID id, UUID serviceId, String title, String description,
        String steps, String tags, String actionType, int currentRevision,
        UUID createdBy, Instant createdAt, Instant updatedAt
) {
    public static RunbookDTO from(Runbook r) {
        return new RunbookDTO(r.getId(), r.getServiceId(), r.getTitle(),
                r.getDescription(), r.getSteps(), r.getTags(), r.getActionType(),
                r.getCurrentRevision(), r.getCreatedBy(), r.getCreatedAt(), r.getUpdatedAt());
    }
}
