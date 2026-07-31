package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.application.port.in.PostmortemPort;
import com.astrawatch.orchestrator.application.port.out.PostmortemRepository;
import com.astrawatch.orchestrator.domain.model.ActionItem;
import com.astrawatch.orchestrator.domain.model.Postmortem;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PostmortemService implements PostmortemPort {

    private final PostmortemRepository postmortemRepository;

    public Optional<Postmortem> getByIncident(UUID incidentId) {
        return postmortemRepository.findByIncidentId(incidentId);
    }

    @Transactional
    public Postmortem createOrUpdate(UUID incidentId, Postmortem postmortem) {
        Optional<Postmortem> existing = postmortemRepository.findByIncidentId(incidentId);
        if (existing.isPresent()) {
            Postmortem p = existing.get();
            p.setSummary(postmortem.getSummary());
            p.setTimelineEdits(postmortem.getTimelineEdits());
            p.setContributingFactors(postmortem.getContributingFactors());
            p.setSeverityWasAccurate(postmortem.getSeverityWasAccurate());
            p.setLessonsLearned(postmortem.getLessonsLearned());
            return postmortemRepository.save(p);
        }
        postmortem.setIncidentId(incidentId);
        return postmortemRepository.save(postmortem);
    }

    public List<ActionItem> getActionItems(UUID postmortemId) {
        return postmortemRepository.findActionItemsByPostmortemId(postmortemId);
    }

    public ActionItem createActionItem(ActionItem item) {
        return postmortemRepository.saveActionItem(item);
    }
}
