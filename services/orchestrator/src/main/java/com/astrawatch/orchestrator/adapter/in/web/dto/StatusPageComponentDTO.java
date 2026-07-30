package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.StatusPageComponent;

import java.time.Instant;
import java.util.UUID;

public record StatusPageComponentDTO(
        UUID id, UUID orgId, String name, String description,
        String groupName, String status, int displayOrder, Instant createdAt
) {
    public static StatusPageComponentDTO from(StatusPageComponent c) {
        return new StatusPageComponentDTO(c.getId(), c.getOrgId(), c.getName(),
                c.getDescription(), c.getGroupName(), c.getStatus(),
                c.getDisplayOrder(), c.getCreatedAt());
    }
}
