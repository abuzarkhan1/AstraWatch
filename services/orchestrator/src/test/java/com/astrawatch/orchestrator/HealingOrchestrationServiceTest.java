package com.astrawatch.orchestrator;

import com.astrawatch.orchestrator.adapter.out.kafka.KafkaEventProducer;
import com.astrawatch.orchestrator.adapter.out.persistence.HealingActionRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.application.service.*;
import com.astrawatch.orchestrator.domain.model.HealingAction;
import com.astrawatch.orchestrator.domain.model.Incident;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class HealingOrchestrationServiceTest {

    private HealingActionRepository healingActionRepository;
    private IncidentRepository incidentRepository;
    private RiskScoringService riskScoringService;
    private IncidentCommandService incidentCommandService;
    private NotificationService notificationService;
    private KafkaEventProducer kafkaEventProducer;
    private ObjectMapper objectMapper;

    private HealingOrchestrationService healingService;

    @BeforeEach
    void setUp() {
        healingActionRepository = mock(HealingActionRepository.class);
        incidentRepository = mock(IncidentRepository.class);
        riskScoringService = mock(RiskScoringService.class);
        incidentCommandService = mock(IncidentCommandService.class);
        notificationService = mock(NotificationService.class);
        kafkaEventProducer = mock(KafkaEventProducer.class);
        objectMapper = new ObjectMapper();

        healingService = new HealingOrchestrationService(
                healingActionRepository,
                incidentRepository,
                riskScoringService,
                incidentCommandService,
                notificationService,
                kafkaEventProducer,
                objectMapper,
                null,
                null,
                null
        );
    }

    @Test
    void testToggleHealingEnabled() {
        healingService.setHealingEnabled(false);
        assertFalse(healingService.isHealingEnabled());

        healingService.setHealingEnabled(true);
        assertTrue(healingService.isHealingEnabled());
    }

    @Test
    void testTriggerHealingHighRiskRequiresPending() {
        UUID incidentId = UUID.randomUUID();
        Incident incident = Incident.builder().id(incidentId).build();

        when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
        when(healingActionRepository.findByIncidentIdOrderByCreatedAtDesc(incidentId)).thenReturn(Collections.emptyList());
        when(riskScoringService.calculateRiskScore(any(), anyString(), any())).thenReturn(80);
        when(healingActionRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        HealingAction action = healingService.triggerHealing(incidentId, "RESTART_POD", Map.of("pod", "test-pod"));

        assertEquals(HealingAction.HealingStatus.PENDING, action.getStatus());
        assertEquals(80, action.getRiskScore());
    }

    @Test
    void testTriggerHealingLowRiskAutoApproves() {
        UUID incidentId = UUID.randomUUID();
        Incident incident = Incident.builder().id(incidentId).build();

        when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
        when(healingActionRepository.findByIncidentIdOrderByCreatedAtDesc(incidentId)).thenReturn(Collections.emptyList());
        when(riskScoringService.calculateRiskScore(any(), anyString(), any())).thenReturn(25);
        when(healingActionRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        HealingAction action = healingService.triggerHealing(incidentId, "RESTART_POD", Map.of("pod", "test-pod"));

        assertEquals(HealingAction.HealingStatus.APPROVED, action.getStatus());
        assertEquals(25, action.getRiskScore());
    }

    @Test
    void testExecuteActionPublishesKafkaEvent() {
        UUID actionId = UUID.randomUUID();
        UUID incidentId = UUID.randomUUID();
        HealingAction action = HealingAction.builder()
                .id(actionId)
                .incidentId(incidentId)
                .actionType("RESTART_POD")
                .parameters("{}")
                .riskScore(30)
                .status(HealingAction.HealingStatus.APPROVED)
                .build();

        when(healingActionRepository.findById(actionId)).thenReturn(Optional.of(action));
        when(healingActionRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        HealingAction executed = healingService.executeAction(actionId);

        assertEquals(HealingAction.HealingStatus.EXECUTING, executed.getStatus());
        verify(kafkaEventProducer, times(1)).publish(eq("healing-actions"), eq(actionId.toString()), any());
    }
}
