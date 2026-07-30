package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.SLODefinition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SLORepository extends JpaRepository<SLODefinition, UUID> {
    List<SLODefinition> findByServiceId(UUID serviceId);
}
