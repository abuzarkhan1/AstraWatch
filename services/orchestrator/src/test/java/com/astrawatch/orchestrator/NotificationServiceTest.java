package com.astrawatch.orchestrator;

import com.astrawatch.orchestrator.application.port.out.NotificationRepository;
import com.astrawatch.orchestrator.application.service.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class NotificationServiceTest {

    private NotificationRepository notificationRepository;
    private NotificationService notificationService;

    @BeforeEach
    void setUp() {
        notificationRepository = mock(NotificationRepository.class);
        notificationService = new NotificationService(
                notificationRepository,
                Optional.empty(),
                Optional.empty()
        );
        // In a plain unit test there is no Spring container to run the @PostConstruct,
        // so ensure the unsubscribe secret is materialized (generates ephemeral secret).
        notificationService.ensureUnsubscribeSecret();
    }

    @Test
    void testUnsubscribeTokenGenerationAndVerification() {
        String email = "test@astrawatch.io";
        String token = notificationService.generateUnsubscribeToken(email);

        assertNotNull(token);
        assertTrue(notificationService.verifyUnsubscribeToken(token));
        assertTrue(notificationService.unsubscribe(token));
    }

    @Test
    void testInvalidUnsubscribeTokenFailsVerification() {
        assertFalse(notificationService.verifyUnsubscribeToken("invalid-token-string"));
        assertFalse(notificationService.unsubscribe("invalid-token-string"));
    }
}
