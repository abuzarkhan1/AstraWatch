package com.astrawatch.orchestrator.infrastructure.security;

import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.domain.model.User;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Resolves the effective org context for org-scoped endpoints. When a request
 * carries an explicit orgId query param that wins; otherwise the org is derived
 * from the authenticated user (user.teamId -> teams.org_id). Previously the
 * status-page/notifications/oncall/escalation controllers passed a null orgId
 * straight to the repositories, so a logged-in user with a team saw empty org
 * pages even though their org had data (audit fix).
 */
@Component
public class OrgContextResolver {

    private final UserRepository userRepository;
    private final JdbcTemplate jdbcTemplate;

    public OrgContextResolver(UserRepository userRepository, JdbcTemplate jdbcTemplate) {
        this.userRepository = userRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Explicit orgId wins; otherwise resolve from the JWT principal's user. */
    public UUID resolve(UUID requestedOrgId) {
        if (requestedOrgId != null) return requestedOrgId;
        return resolveFromPrincipal();
    }

    /** Resolve from the authenticated user only (no explicit param). */
    public UUID resolveFromPrincipal() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getPrincipal() == null) return null;
        UUID userId = parseUuid(String.valueOf(auth.getPrincipal()));
        if (userId == null) return null;
        User user = userRepository.findById(userId).orElse(null);
        if (user == null || user.getTeamId() == null) return null;
        List<UUID> orgIds = jdbcTemplate.query(
                "SELECT org_id FROM teams WHERE id = ?",
                (rs, i) -> rs.getObject("org_id", UUID.class),
                user.getTeamId());
        return orgIds.isEmpty() ? null : orgIds.get(0);
    }

    private static UUID parseUuid(String value) {
        try {
            return value == null ? null : UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
