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

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
        if (status == null) status = HealingStatus.PENDING;
    }

    public enum HealingStatus {
        PENDING, APPROVED, EXECUTING, VALIDATING, COMPLETED, ROLLED_BACK, FAILED, DRY_RUN
    }
}
