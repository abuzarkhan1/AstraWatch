package com.astrawatch.orchestrator.application.port.in;

import com.astrawatch.orchestrator.domain.model.StatusPageComponent;
import com.astrawatch.orchestrator.domain.model.StatusPageMaintenance;
import com.astrawatch.orchestrator.domain.model.StatusPageSubscriber;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface StatusPagePort {
    List<StatusPageComponent> getComponents(UUID orgId);
    StatusPageComponent createComponent(StatusPageComponent component);
    Optional<StatusPageComponent> updateComponentStatus(UUID id, String status);
    List<StatusPageSubscriber> getSubscribers(UUID orgId);
    StatusPageSubscriber createSubscriber(StatusPageSubscriber subscriber);
    void deleteSubscriber(UUID id);
    List<StatusPageMaintenance> getMaintenances(UUID orgId);
    StatusPageMaintenance createMaintenance(StatusPageMaintenance maintenance);
}
