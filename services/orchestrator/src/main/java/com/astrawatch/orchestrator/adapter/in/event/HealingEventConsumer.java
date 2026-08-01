package com.astrawatch.orchestrator.adapter.in.event;

import com.astrawatch.orchestrator.application.service.HealingOrchestrationService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

/**
 * Closes the healing loop (audit F1/F2): the operator executes orchestrator-approved
 * actions and reports the outcome on healing-completed / healing-failed. This
 * consumer validates the result, then marks the action COMPLETED (and the incident
 * RESOLVED) on success, or FAILED/ROLLED_BACK (incident ESCALATED) on failure.
 */
@Component
public class HealingEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(HealingEventConsumer.class);

    private final HealingOrchestrationService healingService;
    private final ObjectMapper objectMapper;

    @Autowired
    public HealingEventConsumer(HealingOrchestrationService healingService, ObjectMapper objectMapper) {
        this.healingService = healingService;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "healing-completed", groupId = "orchestrator-group")
    public void consumeHealingCompleted(String message) {
        try {
            JsonNode node = objectMapper.readTree(message);
            UUID actionId = UUID.fromString(node.path("actionId").asText());
            boolean success = node.path("success").asBoolean(true);
            Map<String, Object> afterMetrics = objectMapper.convertValue(
                    node.has("afterMetrics") ? node.get("afterMetrics") : objectMapper.createObjectNode(),
                    Map.class);

            if (success) {
                log.info("Healing action completed successfully: actionId={}", actionId);
                healingService.completeAction(actionId, true, afterMetrics);
            } else {
                // v1 shortcut (audit DoD): failure maps to FAILED + ESCALATED. The operator
                // reports only execution success/failure (not metric-improvement validation),
                // so a true rollback command is not sent here — escalation hands it to a
                // human. Revisit when the operator reports before/after validation.
                String reason = node.path("error").asText("operator reported failure");
                log.warn("Healing action failed, escalating incident: actionId={}, reason={}", actionId, reason);
                healingService.completeAction(actionId, false, afterMetrics);
            }
        } catch (Exception e) {
            log.error("Failed to process healing-completed event: {}", e.getMessage(), e);
        }
    }

    @KafkaListener(topics = "healing-failed", groupId = "orchestrator-group")
    public void consumeHealingFailed(String message) {
        try {
            JsonNode node = objectMapper.readTree(message);
            UUID actionId = UUID.fromString(node.path("actionId").asText());
            String reason = node.path("error").asText("operator reported failure");

            log.warn("Healing action failed (healing-failed topic), escalating incident: actionId={}, reason={}", actionId, reason);
            healingService.completeAction(actionId, false, Map.of("failureReason", reason));
        } catch (Exception e) {
            log.error("Failed to process healing-failed event: {}", e.getMessage(), e);
        }
    }
}
