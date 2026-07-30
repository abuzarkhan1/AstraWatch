package com.astrawatch.orchestrator.application.port.out;

import com.astrawatch.orchestrator.domain.model.Runbook;
import com.astrawatch.orchestrator.domain.model.RunbookVersion;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RunbookRepository {
    List<Runbook> findRunbooksByServiceId(UUID serviceId);
    Optional<Runbook> findRunbookById(UUID id);
    Runbook saveRunbook(Runbook runbook);
    List<RunbookVersion> findVersionsByRunbookId(UUID runbookId);
    RunbookVersion saveRunbookVersion(RunbookVersion version);
}
