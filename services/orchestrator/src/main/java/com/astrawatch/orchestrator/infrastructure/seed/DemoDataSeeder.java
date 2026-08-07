package com.astrawatch.orchestrator.infrastructure.seed;

import com.astrawatch.orchestrator.adapter.out.persistence.*;
import com.astrawatch.orchestrator.application.service.RunbookService;
import com.astrawatch.orchestrator.domain.model.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Recreates the demo workspace and seeds every org-scoped page so the product
 * has a complete, competitive feel on first boot. The V11 migration deleted the
 * original demo org/teams/services (they predated real telemetry); this runner
 * restores a demo org + team + the standard telemetry services and then seeds
 * the org-scoped entities — status components, notification channels + rules,
 * on-call rotation, escalation policy, runbooks, SLOs and synthetic checks —
 * all through the same repositories the HTTP APIs use.
 *
 * Idempotent: each step checks whether the org-scoped data already exists and
 * skips it, so re-running the app never duplicates rows. The bootstrap admin
 * user is linked to the demo team so a first login shows populated pages.
 */
@Component
public class DemoDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);

    static final UUID DEMO_ORG = UUID.fromString("00000000-0000-0000-0000-000000000001");
    static final UUID DEMO_TEAM = UUID.fromString("11111111-1111-1111-1111-111111111111");
    static final UUID ADMIN_USER = UUID.fromString("00000000-0000-0000-0000-000000000099");

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final StatusPageComponentRepository componentRepo;
    private final NotificationChannelRepository channelRepo;
    private final NotificationRuleRepository ruleRepo;
    private final OnCallRotationRepository rotationRepo;
    private final EscalationPolicyRepository policyRepo;
    private final RunbookService runbookService;
    private final SLORepository sloRepo;
    private final SyntheticCheckRepository syntheticRepo;

    public DemoDataSeeder(JdbcTemplate jdbcTemplate,
                          ObjectMapper objectMapper,
                          StatusPageComponentRepository componentRepo,
                          NotificationChannelRepository channelRepo,
                          NotificationRuleRepository ruleRepo,
                          OnCallRotationRepository rotationRepo,
                          EscalationPolicyRepository policyRepo,
                          RunbookService runbookService,
                          SLORepository sloRepo,
                          SyntheticCheckRepository syntheticRepo) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.componentRepo = componentRepo;
        this.channelRepo = channelRepo;
        this.ruleRepo = ruleRepo;
        this.rotationRepo = rotationRepo;
        this.policyRepo = policyRepo;
        this.runbookService = runbookService;
        this.sloRepo = sloRepo;
        this.syntheticRepo = syntheticRepo;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        try {
            seedWorkspace();
            seedStatusComponents();
            seedChannels();
            seedRules();
            seedOnCallAndEscalation();
            seedRunbooks();
            seedSlo();
            seedSynthetics();
            log.info("Demo data seeding complete");
        } catch (Exception e) {
            // Log at ERROR with the stack so a seeding failure is visible in boot
            // logs instead of silently leaving pages empty (review fix).
            log.error("Demo data seeding failed (non-fatal but pages will be empty): ", e);
        }
    }

    // ── Workspace: org + team + admin link + services ──────────────────────
    private void seedWorkspace() {
        Integer orgCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM organizations WHERE id = ?", Integer.class, DEMO_ORG);
        if (orgCount == null || orgCount == 0) {
            jdbcTemplate.update("INSERT INTO organizations (id, name, slug, billing_plan, is_active, created_at) VALUES (?, ?, 'astrawatch-cloud', 'enterprise', true, now())",
                    DEMO_ORG, "AstraWatch Cloud");
        }
        Integer teamCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM teams WHERE id = ?", Integer.class, DEMO_TEAM);
        if (teamCount == null || teamCount == 0) {
            jdbcTemplate.update("INSERT INTO teams (id, org_id, name, created_at) VALUES (?, ?, 'SRE Core Team', now())",
                    DEMO_TEAM, DEMO_ORG);
        }
        // Link the bootstrap admin to the demo team so first login sees data.
        Integer adminMember = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM organization_members WHERE org_id = ? AND user_id = ?",
                Integer.class, DEMO_ORG, ADMIN_USER);
        if (adminMember == null || adminMember == 0) {
            jdbcTemplate.update("INSERT INTO organization_members (org_id, user_id, role, joined_at) VALUES (?, ?, 'ADMIN', now())",
                    DEMO_ORG, ADMIN_USER);
        }
        jdbcTemplate.update("UPDATE users SET team_id = ? WHERE id = ?", DEMO_TEAM, ADMIN_USER);

        // Standard telemetry services (catalog keys) for the demo team. The
        // existence check is team-scoped (review fix: a global name check would
        // skip seeding if another team already registered the same catalog key).
        // V20: seeds the catalog metadata (language/owner/repository/tags) so the
        // Catalog page cards show real values instead of silently-dropped rows.
        String[][] services = {
                {"api-gateway", "Go", "Platform", "astrawatch/api-gateway"},
                {"auth-service", "Java", "Identity", "astrawatch/auth-service"},
                {"payment-api", "Go", "Payments", "astrawatch/payment-api"},
                {"order-service", "Java", "Commerce", "astrawatch/order-service"},
                {"inventory-service", "Python", "Commerce", "astrawatch/inventory-service"},
                {"search-service", "Go", "Search", "astrawatch/search-service"},
                {"notification-service", "Node.js", "Messaging", "astrawatch/notification-service"},
                {"checkout-worker", "Go", "Commerce", "astrawatch/checkout-worker"},
                {"postgres-primary", "PostgreSQL", "Data", "astrawatch/infra"},
                {"redis-cache", "Redis", "Data", "astrawatch/infra"},
        };
        for (String[] svc : services) {
            String name = svc[0];
            Integer existing = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM services WHERE name = ? AND team_id = ?", Integer.class, name, DEMO_TEAM);
            if (existing == null || existing == 0) {
                jdbcTemplate.update(
                        "INSERT INTO services (id, name, team_id, cluster, namespace, created_at, language, owner, repository, tags, service_key) "
                                + "VALUES (?, ?, ?, 'us-east-prod-01', 'default', now(), ?, ?, ?, ARRAY['demo','prod'], ?)",
                        UUID.randomUUID(), name, DEMO_TEAM, svc[1], svc[2], svc[3], name);
            } else {
                // Existing row: refresh metadata without touching identity columns.
                jdbcTemplate.update(
                        "UPDATE services SET language = ?, owner = ?, repository = ?, service_key = ? WHERE name = ? AND team_id = ?",
                        svc[1], svc[2], svc[3], name, name, DEMO_TEAM);
            }
        }
        log.info("Demo workspace ready: org {} team {}", DEMO_ORG, DEMO_TEAM);
    }

    // ── Status page components ─────────────────────────────────────────────
    private void seedStatusComponents() {
        if (!componentRepo.findByOrgIdOrderByDisplayOrderAsc(DEMO_ORG).isEmpty()) return;
        String[][] rows = {
                {"API Gateway", "Edge routing and rate limiting", "APIs", "OPERATIONAL", "0"},
                {"Payment API", "Checkout and payment processing", "APIs", "OPERATIONAL", "1"},
                {"Order Service", "Order lifecycle management", "Core", "OPERATIONAL", "2"},
                {"Auth Service", "Authentication and sessions", "Core", "DEGRADED", "3"},
                {"Postgres Primary", "Primary transactional database", "Data Stores", "OPERATIONAL", "4"},
                {"Redis Cache", "Distributed cache layer", "Data Stores", "OPERATIONAL", "5"},
        };
        for (String[] r : rows) {
            StatusPageComponent c = new StatusPageComponent();
            c.setOrgId(DEMO_ORG);
            c.setName(r[0]);
            c.setDescription(r[1]);
            c.setGroupName(r[2]);
            c.setStatus(r[3]);
            c.setDisplayOrder(Integer.parseInt(r[4]));
            componentRepo.save(c);
        }
        log.info("Seeded {} status components", rows.length);
    }

    // ── Notification channels ─────────────────────────────────────────────
    private void seedChannels() {
        if (!channelRepo.findByOrgId(DEMO_ORG).isEmpty()) return;
        channelRepo.save(channel("Slack #incidents", "slack", "{\"url\":\"https://example.com/hooks/slack\"}"));
        channelRepo.save(channel("Ops Webhook", "webhook", "{\"url\":\"https://example.com/hooks/astrawatch\"}"));
        channelRepo.save(channel("Email to SRE", "email", "{\"url\":\"mailto:sre@astrawatch.io\"}"));
        log.info("Seeded notification channels");
    }

    private NotificationChannel channel(String name, String type, String config) {
        NotificationChannel ch = new NotificationChannel();
        ch.setOrgId(DEMO_ORG);
        ch.setName(name);
        ch.setType(type);
        ch.setConfig(config);
        ch.setEnabled(true);
        return ch;
    }

    // ── Alert rules (real conditions the evaluator checks against metrics) ─
    private void seedRules() {
        if (!ruleRepo.findByOrgId(DEMO_ORG).isEmpty()) return;
        ruleRepo.save(rule("Payment API high error rate",
                "[{\"metric\":\"error_rate\",\"operator\":\">\",\"threshold\":5}]"));
        ruleRepo.save(rule("High latency on checkout",
                "[{\"metric\":\"latency\",\"operator\":\">\",\"threshold\":500}]"));
        ruleRepo.save(rule("Order service error spike",
                "[{\"metric\":\"error_rate\",\"operator\":\">\",\"threshold\":3}]"));
        log.info("Seeded notification rules");
    }

    private NotificationRule rule(String name, String conditions) {
        NotificationRule r = new NotificationRule();
        r.setOrgId(DEMO_ORG);
        r.setName(name);
        r.setConditions(conditions);
        r.setChannelIds("{}");
        r.setEnabled(true);
        return r;
    }

    // ── On-call rotation + escalation policy ──────────────────────────────
    private void seedOnCallAndEscalation() {
        List<OnCallRotation> rotations = rotationRepo.findByOrgId(DEMO_ORG);
        UUID rotationId;
        if (rotations.isEmpty()) {
            OnCallRotation rotation = new OnCallRotation();
            rotation.setOrgId(DEMO_ORG);
            rotation.setName("Primary SRE Rotation");
            rotation.setDescription("Weekly primary rotation for the SRE core team");
            rotation.setMemberIds("[\"" + ADMIN_USER + "\"]");
            rotation.setShiftLengthHours(168);
            rotation.setTimezone("UTC");
            rotation.setStartsAt(Instant.now());
            rotation.setEnabled(true);
            rotationId = rotationRepo.save(rotation).getId();
        } else {
            rotationId = rotations.get(0).getId();
        }

        List<EscalationPolicy> policies = policyRepo.findByOrgId(DEMO_ORG);
        if (policies.isEmpty()) {
            EscalationPolicy policy = new EscalationPolicy();
            policy.setOrgId(DEMO_ORG);
            policy.setName("SRE Escalation Policy");
            policy.setRotationId(rotationId);
            policy.setSteps("[{\"level\":1,\"afterMinutes\":5,\"targets\":[\"rotation\"]},{\"level\":2,\"afterMinutes\":15,\"targets\":[\"manager\"]}]");
            policy.setEnabled(true);
            policyRepo.save(policy);
        }
        log.info("Seeded on-call rotation + escalation policy");
    }

    // ── Runbooks per service ──────────────────────────────────────────────
    private void seedRunbooks() {
        if (!runbookService.getAllRunbooks().isEmpty()) return;
        Map<String, String[]> playbooks = Map.of(
                "payment-api", new String[]{
                        "Payment API degradation playbook",
                        "1. Check database connection pool\n2. Restart payment workers\n3. Verify recovery",
                        "payments, database",
                        "RESTART"},
                "order-service", new String[]{
                        "Order service recovery",
                        "1. Inspect recent deploys\n2. Roll back last deployment if regression\n3. Drain and restart consumers",
                        "orders, kafka",
                        "ROLLBACK"},
                "auth-service", new String[]{
                        "Auth latency runbook",
                        "1. Check Redis cache hit ratio\n2. Scale auth pods\n3. Reset session store if stale",
                        "auth, redis",
                        "SCALE"},
                "postgres-primary", new String[]{
                        "Database saturation playbook",
                        "1. Check slow query log\n2. Kill runaway queries\n3. Increase connection pool",
                        "database, postgres",
                        "RESTART"});
        for (Map.Entry<String, String[]> e : playbooks.entrySet()) {
            UUID serviceId = serviceIdByName(e.getKey());
            if (serviceId == null) continue;
            Runbook rb = new Runbook();
            rb.setServiceId(serviceId);
            rb.setTitle(e.getValue()[0]);
            rb.setDescription("Standard operating procedure for " + e.getKey());
            rb.setSteps(toJsonArray(e.getValue()[1]));
            rb.setTags(toJsonArray(e.getValue()[2]));
            rb.setActionType(e.getValue()[3]);
            rb.setCurrentRevision(1);
            // Via the service so an initial RunbookVersion row is written —
            // matches API-created runbooks (review fix: direct JPA save left
            // seeded playbooks with empty version history).
            runbookService.createRunbook(rb);
        }
        log.info("Seeded runbooks");
    }

    // ── SLOs keyed by catalog service ─────────────────────────────────────
    private void seedSlo() {
        for (String svc : List.of("payment-api", "order-service", "api-gateway", "notification-service")) {
            if (sloRepo.findFirstByServiceKey(svc).isPresent()) continue;
            SLODefinition slo = new SLODefinition();
            slo.setName(svc + " availability");
            slo.setServiceKey(svc);
            slo.setMetric("error_rate");
            slo.setTargetPercentage(99.5);
            slo.setWindowDays(30);
            sloRepo.save(slo);
        }
        log.info("Seeded SLOs");
    }

    // ── Synthetic checks (real probes the runner executes) ────────────────
    private void seedSynthetics() {
        if (!syntheticRepo.findAllByOrgId(DEMO_ORG).isEmpty()) return;
        String[][] checks = {
                {"Collector health", "http", "http://localhost:8080/v1/health", "60"},
                {"Orchestrator health", "http", "http://localhost:8082/api/v1/health", "60"},
                {"Realtime gateway", "http", "http://localhost:8084/healthz", "120"},
        };
        for (String[] c : checks) {
            SyntheticCheck check = new SyntheticCheck();
            check.setOrgId(DEMO_ORG);
            check.setName(c[0]);
            check.setType(c[1]);
            check.setUrl(c[2]);
            check.setIntervalSeconds(Integer.parseInt(c[3]));
            check.setStatus("passing");
            syntheticRepo.save(check);
        }
        log.info("Seeded synthetic checks");
    }

    // ── helpers ───────────────────────────────────────────────────────────
    private UUID serviceIdByName(String name) {
        try {
            List<UUID> ids = jdbcTemplate.query(
                    "SELECT id FROM services WHERE name = ? LIMIT 1",
                    (rs, i) -> rs.getObject("id", UUID.class), name);
            return ids.isEmpty() ? null : ids.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    private String toJsonArray(String lines) {
        try {
            String[] parts = lines.split("\n");
            java.util.List<String> trimmed = new java.util.ArrayList<>();
            for (String p : parts) {
                String t = p.trim();
                if (!t.isEmpty()) trimmed.add(t);
            }
            return objectMapper.writeValueAsString(trimmed);
        } catch (Exception e) {
            return "[]";
        }
    }
}
