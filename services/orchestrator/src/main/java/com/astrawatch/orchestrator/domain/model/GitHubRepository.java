package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "github_repositories")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GitHubRepository {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "integration_id", nullable = false)
    private UUID integrationId;

    @Column(name = "service_id")
    private UUID serviceId;

    @Column(name = "tenant_id")
    private UUID tenantId;

    @Column(name = "repo_owner", nullable = false)
    private String repoOwner;

    @Column(name = "repo_name", nullable = false)
    private String repoName;

    @Column(name = "default_branch")
    private String defaultBranch;

    @Column(name = "repo_url")
    private String repoUrl;

    @Column(name = "active")
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getIntegrationId() { return integrationId; }
    public void setIntegrationId(UUID integrationId) { this.integrationId = integrationId; }
    public UUID getServiceId() { return serviceId; }
    public void setServiceId(UUID serviceId) { this.serviceId = serviceId; }
    public UUID getTenantId() { return tenantId; }
    public void setTenantId(UUID tenantId) { this.tenantId = tenantId; }
    public String getRepoOwner() { return repoOwner; }
    public void setRepoOwner(String repoOwner) { this.repoOwner = repoOwner; }
    public String getRepoName() { return repoName; }
    public void setRepoName(String repoName) { this.repoName = repoName; }
    public String getDefaultBranch() { return defaultBranch; }
    public void setDefaultBranch(String defaultBranch) { this.defaultBranch = defaultBranch; }
    public String getRepoUrl() { return repoUrl; }
    public void setRepoUrl(String repoUrl) { this.repoUrl = repoUrl; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public static GitHubRepositoryBuilder builder() { return new GitHubRepositoryBuilder(); }
    public static class GitHubRepositoryBuilder {
        private UUID id; private UUID integrationId; private UUID serviceId; private UUID tenantId;
        private String repoOwner; private String repoName; private String defaultBranch; private String repoUrl;
        private boolean active = true;
        public GitHubRepositoryBuilder id(UUID id) { this.id = id; return this; }
        public GitHubRepositoryBuilder integrationId(UUID integrationId) { this.integrationId = integrationId; return this; }
        public GitHubRepositoryBuilder serviceId(UUID serviceId) { this.serviceId = serviceId; return this; }
        public GitHubRepositoryBuilder tenantId(UUID tenantId) { this.tenantId = tenantId; return this; }
        public GitHubRepositoryBuilder repoOwner(String repoOwner) { this.repoOwner = repoOwner; return this; }
        public GitHubRepositoryBuilder repoName(String repoName) { this.repoName = repoName; return this; }
        public GitHubRepositoryBuilder defaultBranch(String defaultBranch) { this.defaultBranch = defaultBranch; return this; }
        public GitHubRepositoryBuilder repoUrl(String repoUrl) { this.repoUrl = repoUrl; return this; }
        public GitHubRepositoryBuilder active(boolean active) { this.active = active; return this; }
        public GitHubRepository build() {
            GitHubRepository r = new GitHubRepository();
            r.id = this.id; r.integrationId = this.integrationId; r.serviceId = this.serviceId; r.tenantId = this.tenantId;
            r.repoOwner = this.repoOwner; r.repoName = this.repoName; r.defaultBranch = this.defaultBranch; r.repoUrl = this.repoUrl;
            r.active = this.active;
            return r;
        }
    }

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
        if (defaultBranch == null || defaultBranch.isBlank()) {
            defaultBranch = "main";
        }
        if (repoUrl == null || repoUrl.isBlank()) {
            repoUrl = "https://github.com/" + repoOwner + "/" + repoName;
        }
    }
}
