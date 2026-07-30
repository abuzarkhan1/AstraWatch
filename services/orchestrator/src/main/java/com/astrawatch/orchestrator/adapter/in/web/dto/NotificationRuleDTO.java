package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.NotificationRule;

import java.time.Instant;
import java.util.UUID;

public record NotificationRuleDTO(
        UUID id, UUID orgId, String name, String conditions,
        String channelIds, boolean isEnabled, Instant createdAt
) {
    public static NotificationRuleDTO from(NotificationRule r) {
        return new NotificationRuleDTO(r.getId(), r.getOrgId(), r.getName(),
                r.getConditions(), r.getChannelIds(), r.isEnabled(), r.getCreatedAt());
    }
}
