package com.astrawatch.orchestrator.application.port.in;

import com.astrawatch.orchestrator.domain.model.MaintenanceWindow;
import com.astrawatch.orchestrator.domain.model.NotificationChannel;
import com.astrawatch.orchestrator.domain.model.NotificationPreference;
import com.astrawatch.orchestrator.domain.model.NotificationRule;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface NotificationPort {
    List<NotificationChannel> getChannels(UUID orgId);
    NotificationChannel createChannel(NotificationChannel channel);
    Optional<NotificationChannel> updateChannel(UUID id, String config);
    void deleteChannel(UUID id);
    List<NotificationRule> getRules(UUID orgId);
    NotificationRule createRule(NotificationRule rule);
    List<NotificationPreference> getPreferences(UUID userId);
    List<MaintenanceWindow> getMaintenanceWindows(UUID orgId);
    MaintenanceWindow createMaintenanceWindow(MaintenanceWindow window);
    void deleteMaintenanceWindow(UUID id);
    void sendAnomalyAlertEmail(com.astrawatch.orchestrator.domain.model.Incident incident);
    void sendHealingStatusEmail(com.astrawatch.orchestrator.domain.model.HealingAction action, String status);
    String generateUnsubscribeToken(String email);
    boolean verifyUnsubscribeToken(String token);
    boolean unsubscribe(String token);
}
