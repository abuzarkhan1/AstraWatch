package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "healing_actions")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HealingAction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "incident_id", nullable = false)
    private UUID incidentId;

    @Column(name = "action_type", nullable = false)
    private String actionType;

    @Column(columnDefinition = "jsonb")
    private String parameters;

    @Column(name = "risk_score", nullable = false)
    private int riskScore;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private HealingStatus status;

    @Column(name = "approved_by")
    private UUID approvedBy;

    @Column(name = "before_metrics", columnDefinition = "jsonb")
    private String beforeMetrics;

    @Column(name = "after_metrics", columnDefinition = "jsonb")
    private String afterMetrics;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getIncidentId() { return incidentId; }
    public void setIncidentId(UUID incidentId) { this.incidentId = incidentId; }
    public String getActionType() { return actionType; }
    public void setActionType(String actionType) { this.actionType = actionType; }
    public String getParameters() { return parameters; }
    public void setParameters(String parameters) { this.parameters = parameters; }
    public int getRiskScore() { return riskScore; }
    public void setRiskScore(int riskScore) { this.riskScore = riskScore; }
    public HealingStatus getStatus() { return status; }
    public void setStatus(HealingStatus status) { this.status = status; }
    public UUID getApprovedBy() { return approvedBy; }
    public void setApprovedBy(UUID approvedBy) { this.approvedBy = approvedBy; }
    public String getBeforeMetrics() { return beforeMetrics; }
    public void setBeforeMetrics(String beforeMetrics) { this.beforeMetrics = beforeMetrics; }
    public String getAfterMetrics() { return afterMetrics; }
    public void setAfterMetrics(String afterMetrics) { this.afterMetrics = afterMetrics; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }

    public static HealingActionBuilder builder() { return new HealingActionBuilder(); }
    public static class HealingActionBuilder {
        private UUID incidentId; private String actionType; private String parameters; private int riskScore; private HealingStatus status;
        public HealingActionBuilder incidentId(UUID incidentId) { this.incidentId = incidentId; return this; }
        public HealingActionBuilder actionType(String actionType) { this.actionType = actionType; return this; }
        public HealingActionBuilder parameters(String parameters) { this.parameters = parameters; return this; }
        public HealingActionBuilder riskScore(int riskScore) { this.riskScore = riskScore; return this; }
        public HealingActionBuilder status(HealingStatus status) { this.status = status; return this; }
        public HealingAction build() {
            HealingAction a = new HealingAction();
            a.incidentId = this.incidentId; a.actionType = this.actionType; a.parameters = this.parameters; a.riskScore = this.riskScore; a.status = this.status;
            return a;
        }
    }

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
        if (status == null) status = HealingStatus.PENDING;
    }

    public enum HealingStatus {
        PENDING, APPROVED, EXECUTING, VALIDATING, COMPLETED, ROLLED_BACK, FAILED, DRY_RUN
    }
}
