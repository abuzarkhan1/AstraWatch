package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

/**
 * A real, persisted runbook execution. Previously executeRunbook fired an HTTP
 * request into the void and returned an executionId that was never tracked;
 * now every execution is recorded with per-step results so the Runbooks page
 * has genuine history.
 *
 * stepResults is a JSON array of {@code {step, status, startedAt, finishedAt,
 * result}} entries — stored as TEXT (V16) so Hibernate String binding works on
 * Postgres (same pattern as notification_rules after V10).
 */
@Entity
@Table(name = "runbook_executions")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RunbookExecution {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "runbook_id")
    private UUID runbookId;

    // RUNNING | COMPLETED | FAILED
    @Column(nullable = false)
    private String status;

    @Column(name = "step_results")
    private String stepResults;

    @Column(name = "started_at", nullable = false, updatable = false)
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "triggered_by")
    private UUID triggeredBy;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getRunbookId() { return runbookId; }
    public void setRunbookId(UUID runbookId) { this.runbookId = runbookId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getStepResults() { return stepResults; }
    public void setStepResults(String stepResults) { this.stepResults = stepResults; }
    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
    public Instant getFinishedAt() { return finishedAt; }
    public void setFinishedAt(Instant finishedAt) { this.finishedAt = finishedAt; }
    public UUID getTriggeredBy() { return triggeredBy; }
    public void setTriggeredBy(UUID triggeredBy) { this.triggeredBy = triggeredBy; }

    @PrePersist
    protected void onCreate() {
        if (startedAt == null) startedAt = Instant.now();
        if (status == null || status.isBlank()) status = "RUNNING";
    }
}
