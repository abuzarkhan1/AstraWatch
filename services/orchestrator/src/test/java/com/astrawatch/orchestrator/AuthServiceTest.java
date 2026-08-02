package com.astrawatch.orchestrator;

import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.application.service.AuthService;
import com.astrawatch.orchestrator.domain.model.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

public class AuthServiceTest {

    private UserRepository userRepository;
    private AuthService authService;

    @BeforeEach
    public void setUp() {
        // AuthService now refuses to start without a JWT_SECRET; inject one for tests.
        System.setProperty("JWT_SECRET", "test-only-secret-0123456789abcdef0123456789abcdef");
        userRepository = mock(UserRepository.class);
        authService = new AuthService(userRepository);
    }

    @Test
    public void testOAuth2GoogleRegistrationAndLogin() {
        when(userRepository.findByOauthProviderAndOauthProviderId(eq("google"), eq("g_12345")))
                .thenReturn(Optional.empty());
        when(userRepository.findByEmail("user@google.com"))
                .thenReturn(Optional.empty());

        // JPA's save() returns the persisted entity (the same instance it was
        // given), including any fields the service set before persisting (name,
        // avatar, emailVerified...) and an id generated at persist time. Modeling
        // that here keeps the profile-sync logic exercised on login from
        // spuriously re-saving, returning null, or NPE-ing on a missing id.
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User persisted = invocation.getArgument(0);
            if (persisted.getId() == null) {
                persisted.setId(UUID.randomUUID());
            }
            return persisted;
        });

        Map<String, String> result = authService.processOAuth2Login("google", null, null, null, "g_12345", "user@google.com", "Google User", null);

        assertNotNull(result.get("accessToken"));
        assertNotNull(result.get("refreshToken"));
        assertEquals("google", result.get("provider"));
        assertEquals("user@google.com", result.get("email"));

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        assertEquals("google", captor.getValue().getOauthProvider());
        assertEquals("g_12345", captor.getValue().getOauthProviderId());
    }

    @Test
    public void testOAuth2GitHubExistingUserLogin() {
        UUID existingUserId = UUID.randomUUID();
        User existingUser = User.builder()
                .id(existingUserId)
                .email("developer@github.com")
                .oauthProvider("github")
                .oauthProviderId("gh_67890")
                .emailVerified(true)
                .build();

        when(userRepository.findByOauthProviderAndOauthProviderId("github", "gh_67890"))
                .thenReturn(Optional.of(existingUser));
        // Profile sync on login may persist the existing user (name differs from
        // the persisted row); save() must return the entity like JPA does, or the
        // login flow NPEs on user.getId().
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User persisted = invocation.getArgument(0);
            if (persisted.getId() == null) {
                persisted.setId(UUID.randomUUID());
            }
            return persisted;
        });

        // code=null keeps the test hermetic: no live POST to github.com's token
        // endpoint. The providerId/email are passed in directly, which still
        // exercises the existing-user lookup + profile-sync path.
        Map<String, String> result = authService.processOAuth2Login("github", null, null, null, "gh_67890", "developer@github.com", "Dev", null);

        assertNotNull(result.get("accessToken"));
        assertEquals("developer@github.com", result.get("email"));
        assertEquals("github", result.get("provider"));
        assertEquals(existingUserId.toString(), result.get("userId"));
    }
}
