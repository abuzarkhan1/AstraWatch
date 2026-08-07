package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "slo_definitions")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SLODefinition {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // Nullable in the DB (V1) — catalog-key SLOs set serviceKey instead (V14).
    @Column(name = "service_id")
    private UUID serviceId;

    // Catalog service key (e.g. "payment-api") — the collector exposes services
    // by their telemetry id, not a UUID. The SLO page resolves SLOs by this key
    // when present (V14). Null for legacy rows that only carry a UUID serviceId.
    @Column(name = "service_key")
    private String serviceKey;

    // Human-readable SLO name (nullable in the DB — V22 made the column
    // nullable because the docker init script created it NOT NULL, which
    // crashed fresh-boot seeding). Populated by the seeder and create API.
    private String name;

    @Column(nullable = false)
    private String metric;

    @Column(name = "target_percentage")
    private Double targetPercentage;

    @Column(name = "window_days")
    private Integer windowDays;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getServiceId() { return serviceId; }
    public void setServiceId(UUID serviceId) { this.serviceId = serviceId; }
    public String getServiceKey() { return serviceKey; }
    public void setServiceKey(String serviceKey) { this.serviceKey = serviceKey; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getMetric() { return metric; }
    public void setMetric(String metric) { this.metric = metric; }
    public Double getTargetPercentage() { return targetPercentage; }
    public void setTargetPercentage(Double targetPercentage) { this.targetPercentage = targetPercentage; }
    public Integer getWindowDays() { return windowDays; }
    public void setWindowDays(Integer windowDays) { this.windowDays = windowDays; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }
}
