package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.in.web.dto.ActionItemDTO;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.application.port.in.PostmortemPort;
import com.astrawatch.orchestrator.domain.model.Incident;
import com.astrawatch.orchestrator.domain.model.Postmortem;
import com.astrawatch.orchestrator.domain.model.User;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Lists real postmortems (audit: the frontend previously fabricated a postmortem
 * row for EVERY incident — fake titles, a fake "Incident system" author, and a
 * made-up PUBLISHED/DRAFT status — even when no postmortem existed. This endpoint
 * returns only records that actually exist in the postmortems table, joined with
 * the real incident title/severity/state and the real author email).
 */
@RestController
@RequestMapping("/api/v1/postmortems")
@RequiredArgsConstructor
public class PostmortemListController {

    private final PostmortemPort postmortemPort;
    private final IncidentRepository incidentRepository;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> list() {
        List<Postmortem> all = postmortemPort.listAll();

        Set<UUID> incidentIds = all.stream()
                .map(Postmortem::getIncidentId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Set<UUID> userIds = all.stream()
                .map(Postmortem::getCreatedBy)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        Map<UUID, Incident> incidents = incidentRepository.findAllById(incidentIds).stream()
                .collect(Collectors.toMap(Incident::getId, i -> i));
        Map<UUID, User> users = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        List<Map<String, Object>> items = all.stream().map(p -> {
            Incident inc = p.getIncidentId() != null ? incidents.get(p.getIncidentId()) : null;
            User author = p.getCreatedBy() != null ? users.get(p.getCreatedBy()) : null;
            // Action-item stats so the list page can render status chips without
            // an N+1 of per-incident action-items calls (audit: the page showed
            // only a binary WRITTEN/EMPTY badge; owners + open items are the
            // part of the workflow teams actually track).
            List<ActionItemDTO> actionItems = p.getId() != null
                    ? postmortemPort.getActionItems(p.getId()).stream().map(ActionItemDTO::from).toList()
                    : List.of();
            long open = actionItems.stream().filter(a -> a.status() == null || a.status().isBlank()
                    || "OPEN".equalsIgnoreCase(a.status()) || "IN_PROGRESS".equalsIgnoreCase(a.status())).count();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", p.getId());
            row.put("incidentId", p.getIncidentId());
            row.put("title", inc != null && inc.getTitle() != null ? inc.getTitle() : null);
            row.put("severity", inc != null && inc.getSeverity() != null ? inc.getSeverity().name() : null);
            row.put("state", inc != null && inc.getState() != null ? inc.getState().name() : null);
            row.put("summary", p.getSummary());
            row.put("lessonsLearned", p.getLessonsLearned());
            row.put("author", author != null ? author.getEmail() : null);
            row.put("createdAt", p.getCreatedAt());
            row.put("updatedAt", p.getUpdatedAt());
            row.put("actionItems", actionItems);
            row.put("openActionItems", open);
            return row;
        }).toList();

        return ResponseEntity.ok(ApiResponse.ok(items));
    }
}
