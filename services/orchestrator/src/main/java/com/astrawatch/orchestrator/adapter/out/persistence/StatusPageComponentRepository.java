package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.StatusPageComponent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface StatusPageComponentRepository extends JpaRepository<StatusPageComponent, UUID> {
    List<StatusPageComponent> findByOrgIdOrderByDisplayOrderAsc(UUID orgId);
}
