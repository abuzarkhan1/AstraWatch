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

    public NotificationPreferenceId getId() { return id; }
    public void setId(NotificationPreferenceId id) { this.id = id; }
    public String getSeverityMin() { return severityMin; }
    public void setSeverityMin(String severityMin) { this.severityMin = severityMin; }
    public LocalTime getQuietHoursStart() { return quietHoursStart; }
    public void setQuietHoursStart(LocalTime quietHoursStart) { this.quietHoursStart = quietHoursStart; }
    public LocalTime getQuietHoursEnd() { return quietHoursEnd; }
    public void setQuietHoursEnd(LocalTime quietHoursEnd) { this.quietHoursEnd = quietHoursEnd; }
    public boolean isEnabled() { return isEnabled; }
    public void setEnabled(boolean enabled) { isEnabled = enabled; }

    @Embeddable
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class NotificationPreferenceId implements Serializable {
        @Column(name = "user_id")
        private UUID userId;

        @Column(name = "channel_type")
        private String channelType;

        public UUID getUserId() { return userId; }
        public void setUserId(UUID userId) { this.userId = userId; }
        public String getChannelType() { return channelType; }
        public void setChannelType(String channelType) { this.channelType = channelType; }
    }
}
