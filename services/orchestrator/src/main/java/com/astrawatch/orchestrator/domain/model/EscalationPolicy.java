package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "escalation_policies")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EscalationPolicy {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "org_id")
    private UUID orgId;

    @Column(nullable = false)
    private String name;

    @Column(name = "rotation_id")
    private UUID rotationId;

    // JSON array of steps: [{"level":1,"afterMinutes":5,"targets":["rotation"]}]
    @Column(columnDefinition = "jsonb", nullable = false)
    private String steps = "[]";

    @Column(name = "is_enabled", nullable = false)
    private boolean isEnabled = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
        if (steps == null || steps.isBlank()) steps = "[]";
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
