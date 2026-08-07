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
    // Stored as TEXT (see V21 migration): the V2 migration created this table
    // with an orphan `rules` column instead of `steps`, so on a fresh DB the
    // `steps` column is created by Hibernate AFTER Flyway runs — a jsonb
    // columnDefinition would bind String as VARCHAR and Postgres rejects that
    // ("column is of type jsonb but expression is of type character varying").
    // A plain String column makes Hibernate create varchar; V21 defensively
    // converts any pre-existing jsonb `steps` to TEXT.
    @Column(nullable = false)
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
