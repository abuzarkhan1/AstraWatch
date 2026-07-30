package com.astrawatch.orchestrator.application.port.in;

import com.astrawatch.orchestrator.domain.model.ActionItem;
import com.astrawatch.orchestrator.domain.model.Postmortem;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PostmortemPort {
    Optional<Postmortem> getByIncident(UUID incidentId);
    Postmortem createOrUpdate(UUID incidentId, Postmortem postmortem);
    List<ActionItem> getActionItems(UUID postmortemId);
    ActionItem createActionItem(ActionItem item);
}
