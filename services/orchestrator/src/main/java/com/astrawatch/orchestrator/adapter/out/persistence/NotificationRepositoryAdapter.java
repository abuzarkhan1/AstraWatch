package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.application.port.out.NotificationRepository;
import com.astrawatch.orchestrator.domain.model.MaintenanceWindow;
import com.astrawatch.orchestrator.domain.model.NotificationChannel;
import com.astrawatch.orchestrator.domain.model.NotificationPreference;
import com.astrawatch.orchestrator.domain.model.NotificationRule;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class NotificationRepositoryAdapter implements NotificationRepository {

    private final NotificationChannelRepository channelJpa;
    private final NotificationRuleRepository ruleJpa;
    private final NotificationPreferenceRepository preferenceJpa;
    private final MaintenanceWindowRepository maintenanceWindowJpa;

    @Override
    public List<NotificationChannel> findChannelsByOrgId(UUID orgId) {
        return channelJpa.findByOrgId(orgId);
    }

    @Override
    public List<NotificationChannel> findAllChannels() {
        return channelJpa.findAll();
    }

    @Override
    public NotificationChannel saveChannel(NotificationChannel channel) {
        return channelJpa.save(channel);
    }

    @Override
    public Optional<NotificationChannel> findChannelById(UUID id) {
        return channelJpa.findById(id);
    }

    @Override
    public void deleteChannelById(UUID id) {
        channelJpa.deleteById(id);
    }

    @Override
    public List<NotificationRule> findRulesByOrgId(UUID orgId) {
        return ruleJpa.findByOrgId(orgId);
    }

    @Override
    public NotificationRule saveRule(NotificationRule rule) {
        return ruleJpa.save(rule);
    }

    @Override
    public Optional<NotificationRule> findRuleById(UUID id) {
        return ruleJpa.findById(id);
    }

    @Override
    public List<NotificationPreference> findPreferencesByUserId(UUID userId) {
        return preferenceJpa.findByIdUserId(userId);
    }

    @Override
    public List<MaintenanceWindow> findMaintenanceWindowsByOrgId(UUID orgId) {
        return maintenanceWindowJpa.findByOrgId(orgId);
    }

    @Override
    public MaintenanceWindow saveMaintenanceWindow(MaintenanceWindow window) {
        return maintenanceWindowJpa.save(window);
    }

    @Override
    public void deleteMaintenanceWindowById(UUID id) {
        maintenanceWindowJpa.deleteById(id);
    }
}
