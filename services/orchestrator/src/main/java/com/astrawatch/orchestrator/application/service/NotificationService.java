package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.application.port.in.NotificationPort;
import com.astrawatch.orchestrator.application.port.out.NotificationRepository;
import com.astrawatch.orchestrator.domain.model.MaintenanceWindow;
import com.astrawatch.orchestrator.domain.model.NotificationChannel;
import com.astrawatch.orchestrator.domain.model.NotificationPreference;
import com.astrawatch.orchestrator.domain.model.NotificationRule;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class NotificationService implements NotificationPort {

    private final NotificationRepository notificationRepository;

    public List<NotificationChannel> getChannels(UUID orgId) {
        return notificationRepository.findChannelsByOrgId(orgId);
    }

    public NotificationChannel createChannel(NotificationChannel channel) {
        return notificationRepository.saveChannel(channel);
    }

    public Optional<NotificationChannel> updateChannel(UUID id, String config) {
        return notificationRepository.findChannelById(id).map(ch -> {
            ch.setConfig(config);
            return notificationRepository.saveChannel(ch);
        });
    }

    @Transactional
    public void deleteChannel(UUID id) {
        notificationRepository.deleteChannelById(id);
    }

    public List<NotificationRule> getRules(UUID orgId) {
        return notificationRepository.findRulesByOrgId(orgId);
    }

    public NotificationRule createRule(NotificationRule rule) {
        return notificationRepository.saveRule(rule);
    }

    public List<NotificationPreference> getPreferences(UUID userId) {
        return notificationRepository.findPreferencesByUserId(userId);
    }

    public List<MaintenanceWindow> getMaintenanceWindows(UUID orgId) {
        return notificationRepository.findMaintenanceWindowsByOrgId(orgId);
    }

    public MaintenanceWindow createMaintenanceWindow(MaintenanceWindow window) {
        return notificationRepository.saveMaintenanceWindow(window);
    }

    @Transactional
    public void deleteMaintenanceWindow(UUID id) {
        notificationRepository.deleteMaintenanceWindowById(id);
    }
}
