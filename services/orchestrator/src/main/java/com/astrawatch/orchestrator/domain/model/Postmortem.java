package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "postmortems")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Postmortem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "incident_id", unique = true)
    private UUID incidentId;

    @Column(columnDefinition = "TEXT")
    private String summary;

    @Column(name = "timeline_edits", columnDefinition = "jsonb")
    private String timelineEdits;

    @Column(name = "contributing_factors", columnDefinition = "TEXT[]")
    private String contributingFactors;

    @Column(name = "severity_was_accurate")
    private Boolean severityWasAccurate;

    @Column(name = "lessons_learned", columnDefinition = "TEXT")
    private String lessonsLearned;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
        updatedAt = Instant.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
