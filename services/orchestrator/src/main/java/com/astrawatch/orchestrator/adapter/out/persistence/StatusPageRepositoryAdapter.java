package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.application.port.out.StatusPageRepository;
import com.astrawatch.orchestrator.domain.model.StatusPageComponent;
import com.astrawatch.orchestrator.domain.model.StatusPageMaintenance;
import com.astrawatch.orchestrator.domain.model.StatusPageSubscriber;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class StatusPageRepositoryAdapter implements StatusPageRepository {

    private final StatusPageComponentRepository componentJpa;
    private final StatusPageSubscriberRepository subscriberJpa;
    private final StatusPageMaintenanceRepository maintenanceJpa;

    @Override
    public List<StatusPageComponent> findComponentsByOrgId(UUID orgId) {
        return componentJpa.findByOrgIdOrderByDisplayOrderAsc(orgId);
    }

    @Override
    public StatusPageComponent saveComponent(StatusPageComponent component) {
        return componentJpa.save(component);
    }

    @Override
    public Optional<StatusPageComponent> findComponentById(UUID id) {
        return componentJpa.findById(id);
    }

    @Override
    public List<StatusPageSubscriber> findSubscribersByOrgId(UUID orgId) {
        return subscriberJpa.findByOrgId(orgId);
    }

    @Override
    public StatusPageSubscriber saveSubscriber(StatusPageSubscriber subscriber) {
        return subscriberJpa.save(subscriber);
    }

    @Override
    public void deleteSubscriberById(UUID id) {
        subscriberJpa.deleteById(id);
    }

    @Override
    public List<StatusPageMaintenance> findMaintenancesByOrgId(UUID orgId) {
        return maintenanceJpa.findByOrgId(orgId);
    }

    @Override
    public StatusPageMaintenance saveMaintenance(StatusPageMaintenance maintenance) {
        return maintenanceJpa.save(maintenance);
    }
}
