package com.astrawatch.orchestrator.application.port.out;

import com.astrawatch.orchestrator.domain.model.StatusPageComponent;
import com.astrawatch.orchestrator.domain.model.StatusPageMaintenance;
import com.astrawatch.orchestrator.domain.model.StatusPageSubscriber;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface StatusPageRepository {
    List<StatusPageComponent> findComponentsByOrgId(UUID orgId);
    StatusPageComponent saveComponent(StatusPageComponent component);
    Optional<StatusPageComponent> findComponentById(UUID id);
    List<StatusPageSubscriber> findSubscribersByOrgId(UUID orgId);
    StatusPageSubscriber saveSubscriber(StatusPageSubscriber subscriber);
    void deleteSubscriberById(UUID id);
    List<StatusPageMaintenance> findMaintenancesByOrgId(UUID orgId);
    StatusPageMaintenance saveMaintenance(StatusPageMaintenance maintenance);
}
