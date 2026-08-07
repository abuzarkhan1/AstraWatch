package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.domain.model.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Auto-provisions a workspace for a newly registered user (audit: register()
 * created the user with teamId = null, so EVERY org-scoped page — synthetics,
 * status page, alerting, on-call — showed an empty "no org context" state for
 * the user's entire first session. Competitors provision a workspace on signup;
 * this mirrors that).
 *
 * On first registration the user gets:
 *   - an organization (name derived from their email),
 *   - a default team under it,
 *   - an organization_members row with ADMIN role,
 *   - their user row linked to the team (teamId), and
 *   - the standard telemetry services seeded for that team so the catalog,
 *     SLO page, runbooks and status components resolve out of the box.
 *
 * Idempotent: never creates a second workspace for a user who already has a
 * teamId.
 */
@Service
public class WorkspaceProvisioner {

    private static final Logger log = LoggerFactory.getLogger(WorkspaceProvisioner.class);

    private final JdbcTemplate jdbcTemplate;
    private final UserRepository userRepository;

    public WorkspaceProvisioner(JdbcTemplate jdbcTemplate, UserRepository userRepository) {
        this.jdbcTemplate = jdbcTemplate;
        this.userRepository = userRepository;
    }

    /** The standard services the telemetry generator emits (and the demo stack seeds). */
    static final List<String> STANDARD_SERVICES = List.of(
            "api-gateway", "auth-service", "payment-api", "order-service",
            "inventory-service", "search-service", "notification-service",
            "checkout-worker", "postgres-primary", "redis-cache"
    );

    @Transactional
    public void provisionForUser(UUID userId, String email) {
        if (userId == null) return;
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) return;
        if (user.getTeamId() != null) {
            log.debug("User {} already has a team; skipping workspace provisioning", userId);
            return;
        }

        String orgSlug = slugify(email);
        UUID orgId = UUID.randomUUID();
        UUID teamId = UUID.randomUUID();
        String orgName = workspaceName(email);

        try {
            jdbcTemplate.update("INSERT INTO organizations (id, name, slug, billing_plan, is_active, created_at) VALUES (?, ?, ?, 'free', true, now())",
                    orgId, orgName, orgSlug);
            jdbcTemplate.update("INSERT INTO teams (id, org_id, name, created_at) VALUES (?, ?, ?, now())",
                    teamId, orgId, orgName + " Team");
            jdbcTemplate.update("INSERT INTO organization_members (org_id, user_id, role, joined_at) VALUES (?, ?, 'ADMIN', now())",
                    orgId, userId);

            user.setTeamId(teamId);
            if (user.getRole() == null || "VIEWER".equals(user.getRole())) {
                user.setRole("ADMIN");
            }
            userRepository.save(user);

            seedServices(teamId);

            log.info("Provisioned workspace for {}: org={} team={} with {} services",
                    email, orgId, teamId, STANDARD_SERVICES.size());
        } catch (Exception e) {
            log.error("Workspace provisioning failed for {}: {}", email, e.getMessage(), e);
        }
    }

    private void seedServices(UUID teamId) {
        for (String name : STANDARD_SERVICES) {
            try {
                // Scope the existence check to THIS team (review fix: a global
                // name check meant the second user's workspace found payment-api
                // already seeded for user A's team and skipped — the new team got
                // zero services).
                Integer existing = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM services WHERE name = ? AND team_id = ?", Integer.class, name, teamId);
                if (existing == null || existing == 0) {
                    jdbcTemplate.update(
                            "INSERT INTO services (id, name, team_id, cluster, namespace, created_at) VALUES (?, ?, ?, ?, ?, now())",
                            UUID.randomUUID(), name, teamId, "default", "default");
                }
            } catch (Exception e) {
                log.warn("Failed to seed service {}: {}", name, e.getMessage());
            }
        }
    }

    private static String slugify(String email) {
        if (email == null || email.isBlank()) return "workspace-" + UUID.randomUUID().toString().substring(0, 8);
        String local = email.contains("@") ? email.substring(0, email.indexOf('@')) : email;
        String slug = local.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        return slug.isEmpty() ? "workspace" : slug;
    }

    private static String workspaceName(String email) {
        if (email == null || email.isBlank()) return "My Workspace";
        String local = email.contains("@") ? email.substring(0, email.indexOf('@')) : email;
        if (local.isBlank()) return "My Workspace";
        return Character.toUpperCase(local.charAt(0)) + local.substring(1) + "'s Workspace";
    }
}
