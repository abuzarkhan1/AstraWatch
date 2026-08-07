package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notification_rules")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationRule {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "org_id")
    private UUID orgId;

    @Column(nullable = false)
    private String name;

    // Stored as TEXT (see V10 migration): Hibernate binds these plain String
    // fields as VARCHAR, which Postgres rejects for native jsonb/UUID[] columns
    // ("column is of type jsonb but expression is of type character varying").
    @Column(nullable = false)
    private String conditions;

    @Column(name = "channel_ids", nullable = false)
    private String channelIds;

    @Column(name = "is_enabled")
    private boolean isEnabled;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_triggered_at")
    private Instant lastTriggeredAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getOrgId() { return orgId; }
    public void setOrgId(UUID orgId) { this.orgId = orgId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getConditions() { return conditions; }
    public void setConditions(String conditions) { this.conditions = conditions; }
    public String getChannelIds() { return channelIds; }
    public void setChannelIds(String channelIds) { this.channelIds = channelIds; }
    public boolean isEnabled() { return isEnabled; }
    public void setEnabled(boolean enabled) { isEnabled = enabled; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getLastTriggeredAt() { return lastTriggeredAt; }
    public void setLastTriggeredAt(Instant lastTriggeredAt) { this.lastTriggeredAt = lastTriggeredAt; }

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
        if (!isEnabled) isEnabled = true;
    }
}
