package com.astrawatch.orchestrator.domain.event;

import lombok.AllArgsConstructor;
import lombok.Data;
import java.time.Instant;
import java.util.UUID;

@Data
@AllArgsConstructor
public class HealingTriggeredEvent {
    private UUID actionId;
    private UUID incidentId;
    private String actionType;
    private String status;
    private Instant timestamp;
}
