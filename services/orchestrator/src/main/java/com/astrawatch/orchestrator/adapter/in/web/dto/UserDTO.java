package com.astrawatch.orchestrator.adapter.in.web.dto;

import com.astrawatch.orchestrator.domain.model.User;

import java.time.Instant;
import java.util.UUID;

public record UserDTO(
        UUID id,
        String email,
        String name,
        String avatarUrl,
        String role,
        UUID teamId,
        Instant createdAt,
        boolean isActive
) {
    public static UserDTO from(User u) {
        return new UserDTO(
                u.getId(),
                u.getEmail(),
                u.getName(),
                u.getAvatarUrl(),
                u.getRole() != null ? u.getRole() : "VIEWER",
                u.getTeamId(),
                u.getCreatedAt(),
                u.isActive()
        );
    }
}
