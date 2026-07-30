package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.io.Serializable;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "notification_preferences")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationPreference {

    @EmbeddedId
    private NotificationPreferenceId id;

    @Column(name = "severity_min")
    private String severityMin;

    @Column(name = "quiet_hours_start")
    private LocalTime quietHoursStart;

    @Column(name = "quiet_hours_end")
    private LocalTime quietHoursEnd;

    @Column(name = "is_enabled")
    private boolean isEnabled;

    @Embeddable
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NotificationPreferenceId implements Serializable {
        @Column(name = "user_id")
        private UUID userId;

        @Column(name = "channel_type")
        private String channelType;
    }
}
