package com.astrawatch.orchestrator;

import com.astrawatch.orchestrator.adapter.in.event.AnomalyEventConsumer;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.application.service.IncidentCommandService;
import com.astrawatch.orchestrator.application.service.NotificationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AnomalyEventConsumerTest {

    private IncidentCommandService incidentService;
    private IncidentRepository incidentRepository;
    private NotificationService notificationService;
    private ObjectMapper objectMapper;
    private AnomalyEventConsumer consumer;

    @BeforeEach
    void setUp() {
        incidentService = mock(IncidentCommandService.class);
        incidentRepository = mock(IncidentRepository.class);
        notificationService = mock(NotificationService.class);
        objectMapper = new ObjectMapper();

        consumer = new AnomalyEventConsumer(
                incidentService,
                incidentRepository,
                notificationService,
                objectMapper,
                null,
                null,
                null,
                null,
                null
        );
    }

    @Test
    void testParseUUIDWithValidUUID() {
        String validUuid = UUID.randomUUID().toString();
        UUID result = AnomalyEventConsumer.parseOrFallbackUUID(validUuid);
        assertEquals(validUuid, result.toString());
    }

    @Test
    void testParseUUIDWithPythonHashFallback() {
        String pythonHash = "-4820491823901";
        UUID result = AnomalyEventConsumer.parseOrFallbackUUID(pythonHash);
        assertNotNull(result);
        // Deterministic check
        UUID secondCall = AnomalyEventConsumer.parseOrFallbackUUID(pythonHash);
        assertEquals(result, secondCall);
    }

    @Test
    void testDeduplicationIgnoresDuplicateEvents() {
        UUID anomalyUuid = UUID.randomUUID();
        String jsonMessage = String.format("{\"eventId\":\"%s\",\"serviceId\":\"%s\",\"anomalyScore\":0.9,\"affectedMetrics\":[\"cpu\"]}",
                anomalyUuid, UUID.randomUUID());

        when(incidentRepository.existsByAnomalyId(anomalyUuid)).thenReturn(true);

        consumer.consumeAnomalyEvent(jsonMessage);

        verify(incidentService, never()).createIncident(any(), any(), any(), any(), any());
    }
}
