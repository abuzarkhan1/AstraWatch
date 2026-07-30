package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.HealingAction;

import java.time.Instant;
import java.util.UUID;

public record HealingActionDTO(
        UUID id, UUID incidentId, String actionType, int riskScore,
        String status, UUID approvedBy, String beforeMetrics, String afterMetrics,
        Instant createdAt, Instant completedAt
) {
    public static HealingActionDTO from(HealingAction a) {
        return new HealingActionDTO(a.getId(), a.getIncidentId(), a.getActionType(),
                a.getRiskScore(), a.getStatus().name(), a.getApprovedBy(),
                a.getBeforeMetrics(), a.getAfterMetrics(), a.getCreatedAt(), a.getCompletedAt());
    }
}
