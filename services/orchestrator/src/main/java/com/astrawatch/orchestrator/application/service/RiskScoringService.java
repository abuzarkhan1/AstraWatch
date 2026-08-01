package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.adapter.out.persistence.HealingActionRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.domain.model.HealingAction;
import com.astrawatch.orchestrator.domain.model.Incident;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Calendar;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Risk scoring (audit F9): replaces the previous hardcoded constants with
 * data-driven inputs — blast radius derived from the service's open-incident
 * load and severity, and historical success derived from past healing actions
 * of the same type. Per-component weights are configurable via properties.
 */
@Service
public class RiskScoringService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(RiskScoringService.class);

    private final IncidentRepository incidentRepository;
    private final HealingActionRepository healingActionRepository;

    @Value("${astrawatch.risk.weight.blast-radius:30}")
    private int wBlastRadius;

    @Value("${astrawatch.risk.weight.reversibility:30}")
    private int wReversibility;

    @Value("${astrawatch.risk.weight.history:25}")
    private int wHistory;

    @Value("${astrawatch.risk.weight.business-hours:15}")
    private int wBusinessHours;

    public RiskScoringService(IncidentRepository incidentRepository,
                              HealingActionRepository healingActionRepository) {
        this.incidentRepository = incidentRepository;
        this.healingActionRepository = healingActionRepository;
    }

    public int calculateRiskScore(Incident incident, String actionType, Map<String, Object> parameters) {
        if (incident == null || incident.getServiceId() == null) {
            return 0;
        }

        double score = 0;

        double blastRadius = scoreBlastRadius(incident);
        double reversibility = scoreActionReversibility(actionType);
        double historical = scoreHistoricalSuccess(actionType);
        double business = scoreBusinessHours();

        double totalWeight = wBlastRadius + wReversibility + wHistory + wBusinessHours;
        if (totalWeight > 0) {
            score = (wBlastRadius * blastRadius + wReversibility * reversibility
                    + wHistory * historical + wBusinessHours * business) / totalWeight;
        }

        return Math.min(100, Math.max(0, (int) Math.round(score)));
    }

    /**
     * Blast radius 0–100: higher when the service already has many open
     * (unresolved) incidents and/or the current incident is severe.
     */
    private double scoreBlastRadius(Incident incident) {
        long open = 0;
        for (Incident.IncidentState state : new Incident.IncidentState[]{
                Incident.IncidentState.DETECTED,
                Incident.IncidentState.TRIAGED,
                Incident.IncidentState.INVESTIGATING,
                Incident.IncidentState.HEALING,
                Incident.IncidentState.VALIDATING}) {
            open += incidentRepository.countByServiceIdAndState(incident.getServiceId(), state);
        }

        int severity = switch (incident.getSeverity() == null ? Incident.Severity.MEDIUM : incident.getSeverity()) {
            case LOW -> 15;
            case MEDIUM -> 35;
            case HIGH -> 60;
            case CRITICAL -> 80;
        };

        double load = Math.min(20, open * 4.0); // 5+ open incidents saturate the load term
        return Math.min(100, severity + load);
    }

    private double scoreActionReversibility(String actionType) {
        return switch (actionType == null ? "" : actionType.toLowerCase()) {
            case "restart_pod" -> 20;
            case "scale_deployment" -> 40;
            case "rollback_deployment" -> 60;
            case "database_failover" -> 90;
            case "dns_change" -> 70;
            default -> 45;
        };
    }

    /**
     * Historical success 0–100: derived from past COMPLETED vs total actions of
     * the same type. No history → neutral 50 (neither trusted nor penalized).
     */
    private double scoreHistoricalSuccess(String actionType) {
        if (actionType == null || actionType.isBlank()) {
            return 50;
        }
        try {
            List<HealingAction> past = healingActionRepository.findByActionType(actionType);
            if (past == null || past.isEmpty()) {
                return 50;
            }
            long completed = past.stream()
                    .filter(a -> a.getStatus() == HealingAction.HealingStatus.COMPLETED)
                    .count();
            double successRate = (double) completed / past.size();
            // Low success rate → higher risk (100 = do not trust history).
            return Math.min(100, Math.max(0, (1 - successRate) * 100));
        } catch (Exception e) {
            log.warn("Historical success lookup failed for action type {}: {}", actionType, e.getMessage());
            return 50;
        }
    }

    private double scoreBusinessHours() {
        Calendar cal = Calendar.getInstance();
        int hour = cal.get(Calendar.HOUR_OF_DAY);
        int dayOfWeek = cal.get(Calendar.DAY_OF_WEEK);

        boolean isBusinessHours = (dayOfWeek >= Calendar.MONDAY &&
                dayOfWeek <= Calendar.FRIDAY &&
                hour >= 9 && hour <= 17);

        if (isBusinessHours) {
            return 55; // acting during peak traffic is riskier
        } else if (hour < 6 || hour > 22) {
            return 25; // dead of night — lowest traffic, lowest risk
        }
        return 40;
    }
}
