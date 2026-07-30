package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.application.port.in.StatusPagePort;
import com.astrawatch.orchestrator.application.port.out.StatusPageRepository;
import com.astrawatch.orchestrator.domain.model.StatusPageComponent;
import com.astrawatch.orchestrator.domain.model.StatusPageMaintenance;
import com.astrawatch.orchestrator.domain.model.StatusPageSubscriber;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class StatusPageService implements StatusPagePort {

    private final StatusPageRepository statusPageRepository;

    public List<StatusPageComponent> getComponents(UUID orgId) {
        return statusPageRepository.findComponentsByOrgId(orgId);
    }

    public StatusPageComponent createComponent(StatusPageComponent component) {
        return statusPageRepository.saveComponent(component);
    }

    public Optional<StatusPageComponent> updateComponentStatus(UUID id, String status) {
        return statusPageRepository.findComponentById(id).map(c -> {
            c.setStatus(status);
            return statusPageRepository.saveComponent(c);
        });
    }

    public List<StatusPageSubscriber> getSubscribers(UUID orgId) {
        return statusPageRepository.findSubscribersByOrgId(orgId);
    }

    public StatusPageSubscriber createSubscriber(StatusPageSubscriber subscriber) {
        return statusPageRepository.saveSubscriber(subscriber);
    }

    @Transactional
    public void deleteSubscriber(UUID id) {
        statusPageRepository.deleteSubscriberById(id);
    }

    public List<StatusPageMaintenance> getMaintenances(UUID orgId) {
        return statusPageRepository.findMaintenancesByOrgId(orgId);
    }

    public StatusPageMaintenance createMaintenance(StatusPageMaintenance maintenance) {
        return statusPageRepository.saveMaintenance(maintenance);
    }
}
