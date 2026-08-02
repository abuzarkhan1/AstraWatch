package com.astrawatch.orchestrator.application.port.out;

import com.astrawatch.orchestrator.domain.model.MaintenanceWindow;
import com.astrawatch.orchestrator.domain.model.NotificationChannel;
import com.astrawatch.orchestrator.domain.model.NotificationPreference;
import com.astrawatch.orchestrator.domain.model.NotificationRule;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface NotificationRepository {
    List<NotificationChannel> findChannelsByOrgId(UUID orgId);
    List<NotificationChannel> findAllChannels();
    NotificationChannel saveChannel(NotificationChannel channel);
    Optional<NotificationChannel> findChannelById(UUID id);
    void deleteChannelById(UUID id);
    List<NotificationRule> findRulesByOrgId(UUID orgId);
    NotificationRule saveRule(NotificationRule rule);
    List<NotificationPreference> findPreferencesByUserId(UUID userId);
    List<MaintenanceWindow> findMaintenanceWindowsByOrgId(UUID orgId);
    MaintenanceWindow saveMaintenanceWindow(MaintenanceWindow window);
    void deleteMaintenanceWindowById(UUID id);
}
