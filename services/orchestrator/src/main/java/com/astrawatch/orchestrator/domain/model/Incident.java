package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "incidents")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Incident {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "service_id", nullable = false)
    private UUID serviceId;

    @Column(name = "anomaly_id")
    private UUID anomalyId;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private Severity severity;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private IncidentState state;

    @Column(name = "title")
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "assigned_to")
    private UUID assignedTo;

    @Column(name = "root_cause")
    private String rootCause;

    @Column(name = "resolution_note", columnDefinition = "TEXT")
    private String resolutionNote;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    // Tenant the incident belongs to (V19). The Kafka incident-* events carry
    // this so the realtime gateway pushes to the correct tenant room.
    @Column(name = "tenant_id")
    private String tenantId;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getServiceId() { return serviceId; }
    public void setServiceId(UUID serviceId) { this.serviceId = serviceId; }
    public UUID getAnomalyId() { return anomalyId; }
    public void setAnomalyId(UUID anomalyId) { this.anomalyId = anomalyId; }
    public Severity getSeverity() { return severity; }
    public void setSeverity(Severity severity) { this.severity = severity; }
    public IncidentState getState() { return state; }
    public void setState(IncidentState state) { this.state = state; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public UUID getAssignedTo() { return assignedTo; }
    public void setAssignedTo(UUID assignedTo) { this.assignedTo = assignedTo; }
    public String getRootCause() { return rootCause; }
    public void setRootCause(String rootCause) { this.rootCause = rootCause; }
    public String getResolutionNote() { return resolutionNote; }
    public void setResolutionNote(String resolutionNote) { this.resolutionNote = resolutionNote; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public Instant getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(Instant resolvedAt) { this.resolvedAt = resolvedAt; }
    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public static IncidentBuilder builder() { return new IncidentBuilder(); }
    public static class IncidentBuilder {
        private UUID id; private UUID serviceId; private UUID anomalyId; private Severity severity; private IncidentState state; private String title; private String description; private UUID assignedTo; private String rootCause; private String resolutionNote; private String tenantId;
        public IncidentBuilder id(UUID id) { this.id = id; return this; }
        public IncidentBuilder serviceId(UUID serviceId) { this.serviceId = serviceId; return this; }
        public IncidentBuilder anomalyId(UUID anomalyId) { this.anomalyId = anomalyId; return this; }
        public IncidentBuilder severity(Severity severity) { this.severity = severity; return this; }
        public IncidentBuilder state(IncidentState state) { this.state = state; return this; }
        public IncidentBuilder title(String title) { this.title = title; return this; }
        public IncidentBuilder description(String description) { this.description = description; return this; }
        public IncidentBuilder assignedTo(UUID assignedTo) { this.assignedTo = assignedTo; return this; }
        public IncidentBuilder rootCause(String rootCause) { this.rootCause = rootCause; return this; }
        public IncidentBuilder resolutionNote(String resolutionNote) { this.resolutionNote = resolutionNote; return this; }
        public IncidentBuilder tenantId(String tenantId) { this.tenantId = tenantId; return this; }
        public Incident build() {
            Incident i = new Incident();
            i.id = this.id; i.serviceId = this.serviceId; i.anomalyId = this.anomalyId; i.severity = this.severity; i.state = this.state; i.title = this.title; i.description = this.description; i.assignedTo = this.assignedTo; i.rootCause = this.rootCause; i.resolutionNote = this.resolutionNote; i.tenantId = this.tenantId;
            return i;
        }
    }

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
        updatedAt = Instant.now();
        if (state == null) state = IncidentState.DETECTED;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }

    public enum Severity {
        LOW, MEDIUM, HIGH, CRITICAL
    }

    public enum IncidentState {
        DETECTED, TRIAGED, INVESTIGATING, HEALING, VALIDATING, RESOLVED, ROLLED_BACK, ESCALATED
    }
}
