package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.MaintenanceWindow;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface MaintenanceWindowRepository extends JpaRepository<MaintenanceWindow, UUID> {
    List<MaintenanceWindow> findByOrgId(UUID orgId);
    List<MaintenanceWindow> findByEndedAtIsNullAndStartedAtBefore(Instant now);
}
