package com.astrawatch.orchestrator.domain.event;

import lombok.AllArgsConstructor;
import lombok.Data;
import java.time.Instant;
import java.util.UUID;

public class AnomalyDetectedEvent {
    private String eventId;
    private Instant timestamp;
    private UUID serviceId;
    private String tenantId;
    private String cluster;
    private double anomalyScore;
    private String[] affectedMetrics;
    private String traceId;
    /** Raw JSON payload of mined log evidence (Phase 3). Null when no log signal. */
    private String logEvidence;

    public AnomalyDetectedEvent() {}
    public AnomalyDetectedEvent(String eventId, Instant timestamp, UUID serviceId, String cluster, double anomalyScore, String[] affectedMetrics, String traceId) {
        this.eventId = eventId; this.timestamp = timestamp; this.serviceId = serviceId; this.cluster = cluster; this.anomalyScore = anomalyScore; this.affectedMetrics = affectedMetrics; this.traceId = traceId;
    }

    public String getEventId() { return eventId; }
    public Instant getTimestamp() { return timestamp; }
    public UUID getServiceId() { return serviceId; }
    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public String getCluster() { return cluster; }
    public double getAnomalyScore() { return anomalyScore; }
    public String[] getAffectedMetrics() { return affectedMetrics; }
    public String getTraceId() { return traceId; }
    public String getLogEvidence() { return logEvidence; }
    public void setLogEvidence(String logEvidence) { this.logEvidence = logEvidence; }
}
