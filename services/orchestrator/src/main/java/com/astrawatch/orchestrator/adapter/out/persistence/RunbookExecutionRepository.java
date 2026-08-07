package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.RunbookExecution;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RunbookExecutionRepository extends JpaRepository<RunbookExecution, UUID> {
    List<RunbookExecution> findByRunbookIdOrderByStartedAtDesc(UUID runbookId);
}
