package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * One real execution of a synthetic check. Written by the probe runner on every
 * probe and read by GET /checks/{id}/results so the Synthetics page shows real
 * history (uptime %, response times, success/failure timeline).
 */
@Entity
@Table(name = "synthetic_check_results")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SyntheticCheckResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "check_id", nullable = false)
    private UUID checkId;

    /** passing | failing */
    @Column(nullable = false)
    private String status;

    @Column(name = "response_time_ms")
    private Integer responseTimeMs;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "checked_at", nullable = false, updatable = false)
    private Instant checkedAt;

    @PrePersist
    protected void onCreate() {
        if (checkedAt == null) checkedAt = Instant.now();
        if (status == null || status.isBlank()) status = "failing";
    }
}
