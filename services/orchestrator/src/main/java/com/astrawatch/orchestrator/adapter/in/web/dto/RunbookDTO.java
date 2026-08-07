package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.Runbook;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Frontend-facing runbook shape. The page renders steps as a count, tags as an
 * array and severity from actionType (audit: the DTO returned raw String
 * columns, so the UI showed "undefined steps" and blank tags).
 */
public record RunbookDTO(
        UUID id, UUID serviceId, String title, String description,
        int steps, List<String> tags, String severity, String actionType,
        int currentRevision, UUID createdBy, Instant createdAt, Instant lastUpdated
) {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static RunbookDTO from(Runbook r) {
        return new RunbookDTO(r.getId(), r.getServiceId(), r.getTitle(),
                r.getDescription(), countSteps(r.getSteps()), parseTags(r.getTags()),
                severity(r.getActionType()), r.getActionType(), r.getCurrentRevision(),
                r.getCreatedBy(), r.getCreatedAt(),
                r.getUpdatedAt() != null ? r.getUpdatedAt() : r.getCreatedAt());
    }

    private static int countSteps(String stepsJson) {
        if (stepsJson == null || stepsJson.isBlank()) return 0;
        try {
            JsonNode node = MAPPER.readTree(stepsJson);
            return node != null && node.isArray() ? node.size() : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    private static List<String> parseTags(String tagsJson) {
        if (tagsJson == null || tagsJson.isBlank()) return List.of();
        try {
            JsonNode node = MAPPER.readTree(tagsJson);
            if (node != null && node.isArray()) {
                List<String> out = new ArrayList<>();
                node.forEach(n -> out.add(n.asText()));
                return out;
            }
        } catch (Exception ignored) {
        }
        return List.of();
    }

    private static String severity(String actionType) {
        if (actionType == null || actionType.isBlank()) return "STANDARD";
        String upper = actionType.toUpperCase();
        if (upper.contains("CRITICAL")) return "CRITICAL";
        if (upper.contains("HIGH")) return "HIGH";
        return "STANDARD";
    }
}
