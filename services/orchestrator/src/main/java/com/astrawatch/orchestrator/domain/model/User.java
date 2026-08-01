package com.astrawatch.orchestrator.domain.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "oauth_provider")
    private String oauthProvider;

    @Column(name = "oauth_provider_id")
    private String oauthProviderId;

    @Column(name = "name")
    private String name;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(name = "mfa_secret")
    private String mfaSecret;

    @Column(name = "mfa_enabled")
    private boolean mfaEnabled;

    @Column(name = "email_verified")
    private boolean emailVerified;

    @Column(name = "role")
    private String role;

    @Column(name = "is_active")
    private boolean isActive = true;

    @Column(name = "team_id")
    private UUID teamId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public String getOauthProvider() { return oauthProvider; }
    public void setOauthProvider(String oauthProvider) { this.oauthProvider = oauthProvider; }
    public String getOauthProviderId() { return oauthProviderId; }
    public void setOauthProviderId(String oauthProviderId) { this.oauthProviderId = oauthProviderId; }
    public String getMfaSecret() { return mfaSecret; }
    public void setMfaSecret(String mfaSecret) { this.mfaSecret = mfaSecret; }
    public boolean isMfaEnabled() { return mfaEnabled; }
    public void setMfaEnabled(boolean mfaEnabled) { this.mfaEnabled = mfaEnabled; }
    public boolean isEmailVerified() { return emailVerified; }
    public void setEmailVerified(boolean emailVerified) { this.emailVerified = emailVerified; }
    public String getRole() { return role != null ? role : "VIEWER"; }
    public void setRole(String role) { this.role = role; }
    public boolean isActive() { return isActive; }
    public void setActive(boolean isActive) { this.isActive = isActive; }
    public UUID getTeamId() { return teamId; }
    public void setTeamId(UUID teamId) { this.teamId = teamId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public static UserBuilder builder() { return new UserBuilder(); }
    public static class UserBuilder {
        private UUID id; private String email; private String name; private String avatarUrl; private String passwordHash; private String oauthProvider; private String oauthProviderId; private String mfaSecret; private boolean mfaEnabled; private boolean emailVerified;
        private String role = "VIEWER"; private boolean isActive = true; private UUID teamId; private Instant createdAt;

        public UserBuilder id(UUID id) { this.id = id; return this; }
        public UserBuilder email(String email) { this.email = email; return this; }
        public UserBuilder name(String name) { this.name = name; return this; }
        public UserBuilder avatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; return this; }
        public UserBuilder passwordHash(String passwordHash) { this.passwordHash = passwordHash; return this; }
        public UserBuilder oauthProvider(String oauthProvider) { this.oauthProvider = oauthProvider; return this; }
        public UserBuilder oauthProviderId(String oauthProviderId) { this.oauthProviderId = oauthProviderId; return this; }
        public UserBuilder mfaSecret(String mfaSecret) { this.mfaSecret = mfaSecret; return this; }
        public UserBuilder mfaEnabled(boolean mfaEnabled) { this.mfaEnabled = mfaEnabled; return this; }
        public UserBuilder emailVerified(boolean emailVerified) { this.emailVerified = emailVerified; return this; }
        public UserBuilder role(String role) { this.role = role; return this; }
        public UserBuilder isActive(boolean isActive) { this.isActive = isActive; return this; }
        public UserBuilder teamId(UUID teamId) { this.teamId = teamId; return this; }
        public UserBuilder createdAt(Instant createdAt) { this.createdAt = createdAt; return this; }
        public User build() {
            User u = new User();
            u.id = this.id; u.email = this.email; u.name = this.name; u.avatarUrl = this.avatarUrl; u.passwordHash = this.passwordHash; u.oauthProvider = this.oauthProvider; u.oauthProviderId = this.oauthProviderId; u.mfaSecret = this.mfaSecret; u.mfaEnabled = this.mfaEnabled; u.emailVerified = this.emailVerified;
            u.role = this.role != null ? this.role : "VIEWER"; u.isActive = this.isActive; u.teamId = this.teamId; u.createdAt = this.createdAt;
            return u;
        }
    }

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (role == null) {
            role = "VIEWER";
        }
    }
}
