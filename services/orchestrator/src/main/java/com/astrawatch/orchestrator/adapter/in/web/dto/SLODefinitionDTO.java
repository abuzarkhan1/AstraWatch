package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.SLODefinition;

import java.time.Instant;
import java.util.UUID;

public record SLODefinitionDTO(
        UUID id, UUID serviceId, String metric, Double targetPercentage,
        Integer windowDays, Instant createdAt
) {
    public static SLODefinitionDTO from(SLODefinition s) {
        return new SLODefinitionDTO(s.getId(), s.getServiceId(), s.getMetric(),
                s.getTargetPercentage(), s.getWindowDays(), s.getCreatedAt());
    }
}
