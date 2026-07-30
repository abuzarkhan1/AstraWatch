package com.astrawatch.orchestrator.domain.event;

import lombok.AllArgsConstructor;
import lombok.Data;
import java.time.Instant;
import java.util.UUID;

@Data
@AllArgsConstructor
public class AnomalyDetectedEvent {
    private String eventId;
    private Instant timestamp;
    private UUID serviceId;
    private String cluster;
    private double anomalyScore;
    private String[] affectedMetrics;
    private String traceId;
}
