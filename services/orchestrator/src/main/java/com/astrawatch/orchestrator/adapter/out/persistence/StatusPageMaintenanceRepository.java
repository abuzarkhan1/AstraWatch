package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.StatusPageMaintenance;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface StatusPageMaintenanceRepository extends JpaRepository<StatusPageMaintenance, UUID> {
    List<StatusPageMaintenance> findByOrgId(UUID orgId);
}
