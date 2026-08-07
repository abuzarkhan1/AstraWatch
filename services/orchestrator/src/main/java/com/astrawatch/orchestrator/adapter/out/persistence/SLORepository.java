package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.SLODefinition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SLORepository extends JpaRepository<SLODefinition, UUID> {
    List<SLODefinition> findByServiceId(UUID serviceId);
    // Catalog service keys are unique per definition in practice; the SLO page
    // resolves SLOs by the collector's telemetry id (V14), so a key-based lookup
    // is the primary path. Returns Optional because a service may have no SLO.
    Optional<SLODefinition> findFirstByServiceKey(String serviceKey);
}
