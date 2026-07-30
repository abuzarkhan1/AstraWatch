package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.RunbookVersion;

import java.time.Instant;
import java.util.UUID;

public record RunbookVersionDTO(
        Long id, UUID runbookId, int revision, String steps,
        String changelog, UUID createdBy, Instant createdAt
) {
    public static RunbookVersionDTO from(RunbookVersion v) {
        return new RunbookVersionDTO(v.getId(), v.getRunbookId(), v.getRevision(),
                v.getSteps(), v.getChangelog(), v.getCreatedBy(), v.getCreatedAt());
    }
}
