package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "github_integrations")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GitHubIntegration {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id")
    private UUID tenantId;

    @Column(name = "access_token", nullable = false)
    private String accessToken;

    @Column(name = "username")
    private String username;

    @Column(name = "scope")
    private String scope;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getTenantId() { return tenantId; }
    public void setTenantId(UUID tenantId) { this.tenantId = tenantId; }
    public String getAccessToken() { return accessToken; }
    public void setAccessToken(String accessToken) { this.accessToken = accessToken; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public static GitHubIntegrationBuilder builder() { return new GitHubIntegrationBuilder(); }
    public static class GitHubIntegrationBuilder {
        private UUID id; private UUID tenantId; private String accessToken; private String username; private String scope;
        public GitHubIntegrationBuilder id(UUID id) { this.id = id; return this; }
        public GitHubIntegrationBuilder tenantId(UUID tenantId) { this.tenantId = tenantId; return this; }
        public GitHubIntegrationBuilder accessToken(String accessToken) { this.accessToken = accessToken; return this; }
        public GitHubIntegrationBuilder username(String username) { this.username = username; return this; }
        public GitHubIntegrationBuilder scope(String scope) { this.scope = scope; return this; }
        public GitHubIntegration build() {
            GitHubIntegration g = new GitHubIntegration();
            g.id = this.id; g.tenantId = this.tenantId; g.accessToken = this.accessToken; g.username = this.username; g.scope = this.scope;
            return g;
        }
    }

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
        updatedAt = Instant.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
