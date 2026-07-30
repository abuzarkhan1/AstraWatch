package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.domain.model.Incident;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

@Service
@Slf4j
public class RiskScoringService {

    public int calculateRiskScore(Incident incident, String actionType, Map<String, Object> parameters) {
        int score = 0;

        score += scoreBlastRadius(incident.getServiceId());
        score += scoreActionReversibility(actionType);
        score += scoreHistoricalSuccess(actionType);
        score += scoreBusinessHours();

        return Math.min(100, Math.max(0, score));
    }

    private int scoreBlastRadius(UUID serviceId) {
        return 15;
    }

    private int scoreActionReversibility(String actionType) {
        return switch (actionType.toLowerCase()) {
            case "restart_pod" -> 10;
            case "scale_deployment" -> 20;
            case "rollback_deployment" -> 30;
            case "database_failover" -> 70;
            case "dns_change" -> 50;
            default -> 25;
        };
    }

    private int scoreHistoricalSuccess(String actionType) {
        return 15;
    }

    private int scoreBusinessHours() {
        java.util.Calendar cal = java.util.Calendar.getInstance();
        int hour = cal.get(java.util.Calendar.HOUR_OF_DAY);
        int dayOfWeek = cal.get(java.util.Calendar.DAY_OF_WEEK);

        boolean isBusinessHours = (dayOfWeek >= java.util.Calendar.MONDAY &&
                dayOfWeek <= java.util.Calendar.FRIDAY &&
                hour >= 9 && hour <= 17);

        if (isBusinessHours) {
            return 20;
        } else if (hour < 6 || hour > 22) {
            return 5;
        }
        return 10;
    }
}
