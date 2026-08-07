package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "synthetic_checks")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SyntheticCheck {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "org_id", nullable = false)
    private UUID orgId;

    @Column(nullable = false)
    private String name;

    // http | tcp | dns
    @Column(nullable = false)
    private String type = "http";

    @Column(nullable = false)
    private String url;

    @Column(name = "interval_seconds", nullable = false)
    private Integer intervalSeconds = 60;

    @Column(nullable = false)
    private String status = "passing";

    @Column(name = "response_time_ms")
    private Integer responseTimeMs;

    // Nullable: null means "never probed" — a fabricated 100.0 default made an
    // unmonitored check look perfect (audit fix).
    @Column(name = "uptime")
    private Double uptime;

    @Column(name = "last_run_at")
    private Instant lastRunAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
        if (type == null || type.isBlank()) type = "http";
        if (status == null || status.isBlank()) status = "passing";
        if (intervalSeconds == null || intervalSeconds <= 0) intervalSeconds = 60;
        // uptime intentionally left null until a probe records a real value.
    }
}
