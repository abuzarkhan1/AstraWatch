package com.astrawatch.orchestrator;

import com.astrawatch.orchestrator.adapter.in.web.ApiResponse;
import com.astrawatch.orchestrator.adapter.in.web.UserController;
import com.astrawatch.orchestrator.adapter.in.web.dto.UserDTO;
import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.domain.model.User;
import com.astrawatch.orchestrator.domain.model.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

public class UserControllerTest {

    private UserRepository userRepository;
    private UserController userController;

    @BeforeEach
    public void setUp() {
        userRepository = mock(UserRepository.class);
        userController = new UserController(userRepository);
    }

    @Test
    public void testListUsers() {
        UUID userId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        User adminUser = User.builder()
                .id(userId)
                .email("admin@astrawatch.io")
                .role(UserRole.ADMIN.name())
                .teamId(teamId)
                .isActive(true)
                .createdAt(Instant.now())
                .build();

        when(userRepository.findAll()).thenReturn(List.of(adminUser));

        ResponseEntity<ApiResponse<List<UserDTO>>> response = userController.listUsers();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().success());
        List<UserDTO> users = response.getBody().data();
        assertEquals(1, users.size());

        UserDTO dto = users.get(0);
        assertEquals(userId, dto.id());
        assertEquals("admin@astrawatch.io", dto.email());
        assertEquals("ADMIN", dto.role());
        assertEquals(teamId, dto.teamId());
        assertTrue(dto.isActive());
    }

    @Test
    public void testUpdateUserRole() {
        UUID userId = UUID.randomUUID();
        User user = User.builder()
                .id(userId)
                .email("operator@astrawatch.io")
                .role(UserRole.VIEWER.name())
                .isActive(true)
                .createdAt(Instant.now())
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ResponseEntity<ApiResponse<UserDTO>> response = userController.updateUserRole(userId, Map.of("role", "ADMIN"));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        UserDTO dto = response.getBody().data();
        assertEquals("ADMIN", dto.role());
        verify(userRepository).save(user);
    }

    @Test
    public void testToggleUserStatus() {
        UUID userId = UUID.randomUUID();
        User user = User.builder()
                .id(userId)
                .email("user@astrawatch.io")
                .role(UserRole.OPERATOR.name())
                .isActive(true)
                .createdAt(Instant.now())
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ResponseEntity<ApiResponse<UserDTO>> response = userController.toggleUserStatus(userId);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        UserDTO dto = response.getBody().data();
        assertFalse(dto.isActive());
        verify(userRepository).save(user);
    }
}
