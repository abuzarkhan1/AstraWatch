package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.Runbook;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RunbookRepository extends JpaRepository<Runbook, UUID> {
    List<Runbook> findByServiceId(UUID serviceId);
}
