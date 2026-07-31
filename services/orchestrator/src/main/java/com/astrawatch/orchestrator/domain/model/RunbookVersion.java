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

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public UUID getRunbookId() { return runbookId; }
    public void setRunbookId(UUID runbookId) { this.runbookId = runbookId; }
    public int getRevision() { return revision; }
    public void setRevision(int revision) { this.revision = revision; }
    public String getSteps() { return steps; }
    public void setSteps(String steps) { this.steps = steps; }
    public String getChangelog() { return changelog; }
    public void setChangelog(String changelog) { this.changelog = changelog; }
    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID createdBy) { this.createdBy = createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public static RunbookVersionBuilder builder() { return new RunbookVersionBuilder(); }
    public static class RunbookVersionBuilder {
        private UUID runbookId; private int revision; private String steps; private String changelog; private UUID createdBy;
        public RunbookVersionBuilder runbookId(UUID runbookId) { this.runbookId = runbookId; return this; }
        public RunbookVersionBuilder revision(int revision) { this.revision = revision; return this; }
        public RunbookVersionBuilder steps(String steps) { this.steps = steps; return this; }
        public RunbookVersionBuilder changelog(String changelog) { this.changelog = changelog; return this; }
        public RunbookVersionBuilder createdBy(UUID createdBy) { this.createdBy = createdBy; return this; }
        public RunbookVersion build() {
            RunbookVersion rv = new RunbookVersion();
            rv.runbookId = this.runbookId; rv.revision = this.revision; rv.steps = this.steps; rv.changelog = this.changelog; rv.createdBy = this.createdBy;
            return rv;
        }
    }

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }
}
