package com.astrawatch.orchestrator.adapter.in.event;

import com.astrawatch.orchestrator.application.service.IncidentCommandService;
import com.astrawatch.orchestrator.domain.event.AnomalyDetectedEvent;
import com.astrawatch.orchestrator.domain.model.Incident;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
@RequiredArgsConstructor
public class AnomalyEventConsumer {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AnomalyEventConsumer.class);

    private final IncidentCommandService incidentService;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = "anomaly-detected", groupId = "orchestrator-group")
    public void consumeAnomalyEvent(String message) {
        try {
            AnomalyDetectedEvent event = objectMapper.readValue(message, AnomalyDetectedEvent.class);
            log.info("Received anomaly event: serviceId={}, score={}", event.getServiceId(), event.getAnomalyScore());

            Incident.Severity severity = event.getAnomalyScore() > 0.8
                    ? Incident.Severity.CRITICAL
                    : event.getAnomalyScore() > 0.6
                    ? Incident.Severity.HIGH
                    : Incident.Severity.MEDIUM;

            incidentService.createIncident(
                    event.getServiceId(),
                    UUID.fromString(event.getEventId()),
                    severity,
                    "Anomaly detected: " + event.getServiceId(),
                    String.format("Anomaly score: %.2f, affected metrics: %s",
                            event.getAnomalyScore(), String.join(", ", event.getAffectedMetrics()))
            );
        } catch (Exception e) {
            log.error("Failed to process anomaly event: {}", e.getMessage(), e);
        }
    }
}
