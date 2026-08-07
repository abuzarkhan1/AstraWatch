package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "incident_events")

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IncidentEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "incident_id", nullable = false)
    private UUID incidentId;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    // V26: was columnDefinition="jsonb" but payload is a plain JSON string —
    // binding String onto jsonb made every incident-event insert fail.
    @Column
    private String payload;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public UUID getIncidentId() { return incidentId; }
    public void setIncidentId(UUID incidentId) { this.incidentId = incidentId; }
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public String getPayload() { return payload; }
    public void setPayload(String payload) { this.payload = payload; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public static IncidentEventBuilder builder() { return new IncidentEventBuilder(); }
    public static class IncidentEventBuilder {
        private UUID incidentId; private String eventType; private String payload;
        public IncidentEventBuilder incidentId(UUID incidentId) { this.incidentId = incidentId; return this; }
        public IncidentEventBuilder eventType(String eventType) { this.eventType = eventType; return this; }
        public IncidentEventBuilder payload(String payload) { this.payload = payload; return this; }
        public IncidentEvent build() {
            IncidentEvent e = new IncidentEvent();
            e.incidentId = this.incidentId; e.eventType = this.eventType; e.payload = this.payload;
            return e;
        }
    }

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }
}
