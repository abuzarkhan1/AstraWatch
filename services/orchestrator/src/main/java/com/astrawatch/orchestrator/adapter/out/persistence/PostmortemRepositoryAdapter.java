package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.application.port.out.PostmortemRepository;
import com.astrawatch.orchestrator.domain.model.ActionItem;
import com.astrawatch.orchestrator.domain.model.Postmortem;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class PostmortemRepositoryAdapter implements PostmortemRepository {

    private final com.astrawatch.orchestrator.adapter.out.persistence.PostmortemRepository postmortemJpa;
    private final ActionItemRepository actionItemJpa;

    @Override
    public Optional<Postmortem> findByIncidentId(UUID incidentId) {
        return postmortemJpa.findByIncidentId(incidentId);
    }

    @Override
    public Postmortem save(Postmortem postmortem) {
        return postmortemJpa.save(postmortem);
    }

    @Override
    public Optional<Postmortem> findById(UUID id) {
        return postmortemJpa.findById(id);
    }

    @Override
    public List<ActionItem> findActionItemsByPostmortemId(UUID postmortemId) {
        return actionItemJpa.findByPostmortemId(postmortemId);
    }

    @Override
    public ActionItem saveActionItem(ActionItem item) {
        return actionItemJpa.save(item);
    }
}
