package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "runbook_versions")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RunbookVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "runbook_id", nullable = false)
    private UUID runbookId;

    @Column(nullable = false)
    private int revision;

    @Column(columnDefinition = "jsonb", nullable = false)
    private String steps;

    @Column(columnDefinition = "TEXT")
    private String changelog;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }
}
