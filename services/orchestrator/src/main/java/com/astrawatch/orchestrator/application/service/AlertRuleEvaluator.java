package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.adapter.out.external.CollectorMetricsClient;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.NotificationRuleRepository;
import com.astrawatch.orchestrator.domain.model.Incident;
import com.astrawatch.orchestrator.domain.model.NotificationRule;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * REAL alert rule evaluator (audit: notification rules were persisted but
 * NEVER evaluated — the "last triggered" column stayed empty and no rule ever
 * created an incident or paged anyone). Every poll tick this component:
 *
 *  1. loads all enabled notification rules,
 *  2. resolves the services under each rule's org,
 *  3. for every condition ({metric, operator, threshold}) queries the SAME
 *     collector telemetry the dashboards show (avg over the last 5 minutes),
 *  4. when a condition breaches and no OPEN incident already exists for that
 *     service + rule, creates a real incident (with the service's UUID resolved
 *     from the services table) and records the breach time on the rule.
 *
 * The incident flows through the exact same pipeline as analyzer anomalies:
 * notifications, realtime push, healing eligibility.
 */
@Service
public class AlertRuleEvaluator {

    private static final Logger log = LoggerFactory.getLogger(AlertRuleEvaluator.class);

    private final NotificationRuleRepository ruleRepository;
    private final IncidentRepository incidentRepository;
    private final IncidentCommandService incidentService;
    private final CollectorMetricsClient collectorMetricsClient;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AlertRuleEvaluator(NotificationRuleRepository ruleRepository,
                              IncidentRepository incidentRepository,
                              IncidentCommandService incidentService,
                              CollectorMetricsClient collectorMetricsClient,
                              JdbcTemplate jdbcTemplate) {
        this.ruleRepository = ruleRepository;
        this.incidentRepository = incidentRepository;
        this.incidentService = incidentService;
        this.collectorMetricsClient = collectorMetricsClient;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Scheduled(fixedDelayString = "${astrawatch.alerting.poll-ms:30000}")
    @Transactional
    public void evaluateRules() {
        List<NotificationRule> rules;
        try {
            rules = ruleRepository.findAll();
        } catch (Exception e) {
            log.warn("Alert evaluator could not load rules: {}", e.getMessage());
            return;
        }
        if (rules == null || rules.isEmpty()) return;

        for (NotificationRule rule : rules) {
            if (!rule.isEnabled()) continue;
            try {
                evaluateRule(rule);
            } catch (Exception e) {
                log.warn("Alert evaluator failed for rule '{}': {}", rule.getName(), e.getMessage());
            }
        }
    }

    private void evaluateRule(NotificationRule rule) {
        List<Condition> conditions = parseConditions(rule.getConditions());
        if (conditions.isEmpty()) return;

        // Resolve the org's services (catalog keys from the services table,
        // joined through the org -> team -> services chain).
        List<String> serviceKeys = resolveOrgServices(rule.getOrgId());

        for (String serviceKey : serviceKeys) {
            for (Condition cond : conditions) {
                Double value = collectorMetricsClient.queryAvg(serviceKey, cond.metric, 5).orElse(null);
                if (value == null) continue; // no telemetry for this service/metric — honest skip
                if (!breached(cond, value)) continue;

                // Dedupe: one open incident per service + rule title.
                String title = "Alert: " + rule.getName() + " — " + serviceKey;
                if (hasOpenIncident(serviceKey, title)) {
                    log.debug("Alert '{}' already open for {}; skipping duplicate", rule.getName(), serviceKey);
                    continue;
                }

                UUID serviceUuid = resolveServiceUuid(serviceKey);
                String description = String.format(
                        "Rule '%s' triggered: %s %.2f %s %.2f (avg over 5 min, real telemetry).",
                        rule.getName(), cond.metric, value, cond.operator, cond.threshold);
                // Resolve the team (tenant) under the rule's org so realtime pushes
                // land in the correct tenant room.
                String tenantId = resolveTenant(rule.getOrgId());
                Incident incident = incidentService.createIncident(
                        serviceUuid, null,
                        cond.threshold >= 50 || value >= cond.threshold * 2
                                ? Incident.Severity.CRITICAL : Incident.Severity.HIGH,
                        title, description, tenantId);
                recordTriggeredAt(rule, incident.getId());
                log.info("Alert rule '{}' created incident {} for {} ({} {} {})",
                        rule.getName(), incident.getId(), serviceKey, cond.metric, cond.operator, cond.threshold);
            }
        }
    }

    private boolean hasOpenIncident(String serviceKey, String title) {
        // Any non-terminal state blocks a duplicate incident for the same rule.
        Incident.IncidentState[] openStates = {
                Incident.IncidentState.DETECTED, Incident.IncidentState.TRIAGED,
                Incident.IncidentState.INVESTIGATING, Incident.IncidentState.HEALING,
                Incident.IncidentState.VALIDATING, Incident.IncidentState.ESCALATED
        };
        try {
            for (Incident.IncidentState state : openStates) {
                for (Incident inc : incidentRepository.findByStateOrderByCreatedAtDesc(state)) {
                    if (inc.getTitle() != null && inc.getTitle().equals(title)) return true;
                }
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    private void recordTriggeredAt(NotificationRule rule, UUID incidentId) {
        try {
            // Best-effort: update the rule row so the UI's "last triggered" is real.
            jdbcTemplate.update(
                    "UPDATE notification_rules SET last_triggered_at = ? WHERE id = ?",
                    java.sql.Timestamp.from(Instant.now()), rule.getId());
        } catch (Exception e) {
            log.debug("Could not persist last_triggered_at for rule {}: {}", rule.getId(), e.getMessage());
        }
    }

    private UUID resolveServiceUuid(String serviceKey) {
        try {
            List<UUID> ids = jdbcTemplate.query(
                    "SELECT id FROM services WHERE name = ? LIMIT 1",
                    (rs, i) -> rs.getObject("id", UUID.class), serviceKey);
            return ids.isEmpty() ? null : ids.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    /** The team (tenant) UUID under a rule's org — null when the rule has no org. */
    private String resolveTenant(UUID orgId) {
        if (orgId == null) return "default";
        try {
            List<String> teams = jdbcTemplate.query(
                    "SELECT id FROM teams WHERE org_id = ? LIMIT 1",
                    (rs, i) -> rs.getString("id"), orgId);
            return teams.isEmpty() ? "default" : teams.get(0);
        } catch (Exception e) {
            return "default";
        }
    }

    private List<String> resolveOrgServices(UUID orgId) {
        List<String> keys = new ArrayList<>();
        try {
            if (orgId == null) {
                // No org context — evaluate against all registered services.
                keys.addAll(jdbcTemplate.query(
                        "SELECT name FROM services ORDER BY name",
                        (rs, i) -> rs.getString("name")));
            } else {
                keys.addAll(jdbcTemplate.query(
                        "SELECT s.name FROM services s JOIN teams t ON s.team_id = t.id WHERE t.org_id = ? ORDER BY s.name",
                        (rs, i) -> rs.getString("name"), orgId));
            }
        } catch (Exception e) {
            log.warn("Failed to resolve services for alert evaluation: {}", e.getMessage());
        }
        return keys;
    }

    private List<Condition> parseConditions(String conditionsJson) {
        List<Condition> out = new ArrayList<>();
        if (conditionsJson == null || conditionsJson.isBlank()) return out;
        try {
            JsonNode node = objectMapper.readTree(conditionsJson);
            if (node == null || !node.isArray()) return out;
            for (JsonNode c : node) {
                String metric = c.path("metric").asText(null);
                String operator = c.path("operator").asText(">");
                double threshold = c.path("threshold").asDouble(0);
                if (metric != null && !metric.isBlank()) {
                    out.add(new Condition(metric, operator, threshold));
                }
            }
        } catch (Exception e) {
            log.warn("Unparseable rule conditions: {}", e.getMessage());
        }
        return out;
    }

    private boolean breached(Condition c, double value) {
        return switch (c.operator) {
            case "<" -> value < c.threshold;
            case ">=" -> value >= c.threshold;
            case "<=" -> value <= c.threshold;
            case "==" -> Math.abs(value - c.threshold) < 1e-9;
            default -> value > c.threshold;
        };
    }

    private record Condition(String metric, String operator, double threshold) {}
}
