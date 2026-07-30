package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.StatusPageSubscriber;

import java.time.Instant;
import java.util.UUID;

public record StatusPageSubscriberDTO(
        UUID id, UUID orgId, String email, String phone,
        String webhookUrl, boolean isVerified, Instant createdAt
) {
    public static StatusPageSubscriberDTO from(StatusPageSubscriber s) {
        return new StatusPageSubscriberDTO(s.getId(), s.getOrgId(), s.getEmail(),
                s.getPhone(), s.getWebhookUrl(), s.isVerified(), s.getCreatedAt());
    }
}
