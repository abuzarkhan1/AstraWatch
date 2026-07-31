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

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getIncidentId() { return incidentId; }
    public void setIncidentId(UUID incidentId) { this.incidentId = incidentId; }
    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }
    public String getTimelineEdits() { return timelineEdits; }
    public void setTimelineEdits(String timelineEdits) { this.timelineEdits = timelineEdits; }
    public String getContributingFactors() { return contributingFactors; }
    public void setContributingFactors(String contributingFactors) { this.contributingFactors = contributingFactors; }
    public Boolean getSeverityWasAccurate() { return severityWasAccurate; }
    public void setSeverityWasAccurate(Boolean severityWasAccurate) { this.severityWasAccurate = severityWasAccurate; }
    public String getLessonsLearned() { return lessonsLearned; }
    public void setLessonsLearned(String lessonsLearned) { this.lessonsLearned = lessonsLearned; }
    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID createdBy) { this.createdBy = createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

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
