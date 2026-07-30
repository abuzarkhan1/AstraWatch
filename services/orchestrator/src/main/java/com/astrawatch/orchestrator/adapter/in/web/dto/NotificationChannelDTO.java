package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.NotificationChannel;

import java.time.Instant;
import java.util.UUID;

public record NotificationChannelDTO(
        UUID id, UUID orgId, String name, String type,
        String config, boolean isEnabled, Instant createdAt
) {
    public static NotificationChannelDTO from(NotificationChannel c) {
        return new NotificationChannelDTO(c.getId(), c.getOrgId(), c.getName(),
                c.getType(), c.getConfig(), c.isEnabled(), c.getCreatedAt());
    }
}
