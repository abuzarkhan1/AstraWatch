package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.NotificationPreference;

import java.time.LocalTime;
import java.util.UUID;

public record NotificationPreferenceDTO(
        UUID userId, String channelType, String severityMin,
        LocalTime quietHoursStart, LocalTime quietHoursEnd, boolean isEnabled
) {
    public static NotificationPreferenceDTO from(NotificationPreference p) {
        return new NotificationPreferenceDTO(
                p.getId().getUserId(), p.getId().getChannelType(), p.getSeverityMin(),
                p.getQuietHoursStart(), p.getQuietHoursEnd(), p.isEnabled());
    }
}
