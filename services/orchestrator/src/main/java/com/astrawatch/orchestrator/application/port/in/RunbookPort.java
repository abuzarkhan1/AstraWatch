package com.astrawatch.orchestrator.application.port.in;

import com.astrawatch.orchestrator.domain.model.Runbook;
import com.astrawatch.orchestrator.domain.model.RunbookVersion;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RunbookPort {
    List<Runbook> getRunbooks(UUID serviceId);
    Optional<Runbook> getRunbook(UUID id);
    Runbook createRunbook(Runbook runbook);
    Runbook updateRunbook(UUID id, Runbook updated);
    List<RunbookVersion> getVersions(UUID runbookId);
}
