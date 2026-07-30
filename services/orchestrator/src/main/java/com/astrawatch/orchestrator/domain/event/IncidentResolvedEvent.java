package com.astrawatch.orchestrator.domain.event;

import lombok.AllArgsConstructor;
import lombok.Data;
import java.time.Instant;
import java.util.UUID;

@Data
@AllArgsConstructor
public class IncidentResolvedEvent {
    private UUID incidentId;
    private UUID serviceId;
    private Instant resolvedAt;
    private String resolutionNote;
}
