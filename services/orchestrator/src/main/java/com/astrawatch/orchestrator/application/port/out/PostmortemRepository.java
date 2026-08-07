package com.astrawatch.orchestrator.application.port.out;

import com.astrawatch.orchestrator.domain.model.ActionItem;
import com.astrawatch.orchestrator.domain.model.Postmortem;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PostmortemRepository {
    Optional<Postmortem> findByIncidentId(UUID incidentId);
    List<Postmortem> findAll();
    Postmortem save(Postmortem postmortem);
    Optional<Postmortem> findById(UUID id);
    List<ActionItem> findActionItemsByPostmortemId(UUID postmortemId);
    ActionItem saveActionItem(ActionItem item);
}
