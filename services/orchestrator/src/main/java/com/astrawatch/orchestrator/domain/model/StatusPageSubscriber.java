package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "status_page_subscribers")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StatusPageSubscriber {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "org_id")
    private UUID orgId;

    private String email;

    private String phone;

    @Column(name = "webhook_url")
    private String webhookUrl;

    @Column(name = "is_verified")
    private boolean isVerified;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }
}
