package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.application.port.out.RunbookRepository;
import com.astrawatch.orchestrator.domain.model.Runbook;
import com.astrawatch.orchestrator.domain.model.RunbookVersion;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class RunbookRepositoryAdapter implements RunbookRepository {

    private final com.astrawatch.orchestrator.adapter.out.persistence.RunbookRepository runbookJpa;
    private final RunbookVersionRepository versionJpa;

    @Override
    public List<Runbook> findRunbooksByServiceId(UUID serviceId) {
        return runbookJpa.findByServiceId(serviceId);
    }

    @Override
    public Optional<Runbook> findRunbookById(UUID id) {
        return runbookJpa.findById(id);
    }

    @Override
    public Runbook saveRunbook(Runbook runbook) {
        return runbookJpa.save(runbook);
    }

    @Override
    public List<RunbookVersion> findVersionsByRunbookId(UUID runbookId) {
        return versionJpa.findByRunbookIdOrderByRevisionDesc(runbookId);
    }

    @Override
    public RunbookVersion saveRunbookVersion(RunbookVersion version) {
        return versionJpa.save(version);
    }
}
