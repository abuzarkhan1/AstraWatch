package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.ActionItem;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record ActionItemDTO(
        UUID id, UUID postmortemId, String description, UUID ownerId,
        String status, LocalDate dueDate, Instant completedAt, Instant createdAt
) {
    public static ActionItemDTO from(ActionItem a) {
        return new ActionItemDTO(a.getId(), a.getPostmortemId(), a.getDescription(),
                a.getOwnerId(), a.getStatus(), a.getDueDate(), a.getCompletedAt(), a.getCreatedAt());
    }
}
