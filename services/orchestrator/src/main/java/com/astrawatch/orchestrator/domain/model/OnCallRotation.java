package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "on_call_rotations")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OnCallRotation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "org_id")
    private UUID orgId;

    @Column(nullable = false)
    private String name;

    private String description;

    // JSON array of user UUIDs in shift order: ["<uuid>", ...]
    @Column(name = "member_ids", columnDefinition = "jsonb", nullable = false)
    private String memberIds = "[]";

    @Column(name = "shift_length_hours", nullable = false)
    private Integer shiftLengthHours = 168;

    @Column(nullable = false)
    private String timezone = "UTC";

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "is_enabled", nullable = false)
    private boolean isEnabled = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
        if (startsAt == null) startsAt = now;
        if (memberIds == null || memberIds.isBlank()) memberIds = "[]";
        if (shiftLengthHours == null || shiftLengthHours <= 0) shiftLengthHours = 168;
        if (timezone == null || timezone.isBlank()) timezone = "UTC";
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
