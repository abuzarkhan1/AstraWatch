package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.Postmortem;

import java.time.Instant;
import java.util.UUID;

public record PostmortemDTO(
        UUID id, UUID incidentId, String summary, String timelineEdits,
        String contributingFactors, Boolean severityWasAccurate,
        String lessonsLearned, UUID createdBy, Instant createdAt, Instant updatedAt
) {
    public static PostmortemDTO from(Postmortem p) {
        return new PostmortemDTO(p.getId(), p.getIncidentId(), p.getSummary(),
                p.getTimelineEdits(), p.getContributingFactors(), p.getSeverityWasAccurate(),
                p.getLessonsLearned(), p.getCreatedBy(), p.getCreatedAt(), p.getUpdatedAt());
    }
}
