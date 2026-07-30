package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.application.port.in.RunbookPort;
import com.astrawatch.orchestrator.application.port.out.RunbookRepository;
import com.astrawatch.orchestrator.domain.model.Runbook;
import com.astrawatch.orchestrator.domain.model.RunbookVersion;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class RunbookService implements RunbookPort {

    private final RunbookRepository runbookRepository;

    public List<Runbook> getRunbooks(UUID serviceId) {
        return runbookRepository.findRunbooksByServiceId(serviceId);
    }

    public Optional<Runbook> getRunbook(UUID id) {
        return runbookRepository.findRunbookById(id);
    }

    @Transactional
    public Runbook createRunbook(Runbook runbook) {
        runbook = runbookRepository.saveRunbook(runbook);
        RunbookVersion version = RunbookVersion.builder()
                .runbookId(runbook.getId())
                .revision(runbook.getCurrentRevision())
                .steps(runbook.getSteps())
                .changelog("Initial version")
                .build();
        runbookRepository.saveRunbookVersion(version);
        return runbook;
    }

    @Transactional
    public Runbook updateRunbook(UUID id, Runbook updated) {
        Runbook runbook = runbookRepository.findRunbookById(id)
                .orElseThrow(() -> new IllegalArgumentException("Runbook not found: " + id));

        int newRevision = runbook.getCurrentRevision() + 1;
        RunbookVersion version = RunbookVersion.builder()
                .runbookId(id)
                .revision(newRevision)
                .steps(updated.getSteps())
                .changelog("Updated")
                .build();
        runbookRepository.saveRunbookVersion(version);

        runbook.setTitle(updated.getTitle());
        runbook.setDescription(updated.getDescription());
        runbook.setSteps(updated.getSteps());
        runbook.setTags(updated.getTags());
        runbook.setActionType(updated.getActionType());
        runbook.setCurrentRevision(newRevision);
        return runbookRepository.saveRunbook(runbook);
    }

    public List<RunbookVersion> getVersions(UUID runbookId) {
        return runbookRepository.findVersionsByRunbookId(runbookId);
    }
}
