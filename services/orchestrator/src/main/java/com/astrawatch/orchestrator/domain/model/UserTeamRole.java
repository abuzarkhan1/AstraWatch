package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.io.Serializable;
import java.util.UUID;

@Entity
@Table(name = "user_team_roles")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserTeamRole {

    @EmbeddedId
    private UserTeamRoleId id;

    @Column(nullable = false)
    private String role;

    @Embeddable
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UserTeamRoleId implements Serializable {
        @Column(name = "user_id")
        private UUID userId;

        @Column(name = "team_id")
        private UUID teamId;
    }
}
