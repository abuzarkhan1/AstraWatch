package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.domain.model.User;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Exposes the authenticated user's plan tier and the feature limits that tier
 * entitles (audit 1.5: subscriptions gated nothing). The plan is kept in sync by
 * the payment-service webhook -> internal /api/v1/internal/billing/plan-changed
 * path. Enforcement hooks (collector agent limits, retention windows) can read
 * this endpoint or the same User.plan column.
 */
@RestController
@RequestMapping("/api/v1/entitlements")
public class EntitlementsController {

    private final UserRepository userRepository;
    private final com.astrawatch.orchestrator.application.service.AuthService authService;

    public EntitlementsController(UserRepository userRepository,
                                  com.astrawatch.orchestrator.application.service.AuthService authService) {
        this.userRepository = userRepository;
        this.authService = authService;
    }

    @GetMapping
    public ResponseEntity<?> getEntitlements(HttpServletRequest request) {
        String token = null;
        if (request.getCookies() != null) {
            for (Cookie c : request.getCookies()) {
                if ("accessToken".equals(c.getName())) { token = c.getValue(); break; }
            }
        }
        if (token == null) {
            String authHeader = request.getHeader("Authorization");
            if (authHeader != null && authHeader.startsWith("Bearer ")) token = authHeader.substring(7);
        }
        if (token == null || !authService.verifyToken(token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse<>(false, "Not authenticated", null));
        }
        String userId = authService.extractUserId(token);
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse<>(false, "Invalid token", null));
        }

        User user = userRepository.findById(UUID.fromString(userId)).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new ApiResponse<>(false, "User not found", null));
        }

        String plan = user.getPlan() != null ? user.getPlan() : "free";
        Map<String, Object> limits = new LinkedHashMap<>();
        switch (plan) {
            case "enterprise" -> {
                limits.put("agents", 100);
                limits.put("teamSeats", 100);
                limits.put("retentionDays", 365);
                limits.put("monthlyIngestGb", 1000);
                limits.put("syntheticChecks", 100);
            }
            case "pro" -> {
                limits.put("agents", 20);
                limits.put("teamSeats", 10);
                limits.put("retentionDays", 90);
                limits.put("monthlyIngestGb", 200);
                limits.put("syntheticChecks", 20);
            }
            default -> {
                limits.put("agents", 3);
                limits.put("teamSeats", 2);
                limits.put("retentionDays", 7);
                limits.put("monthlyIngestGb", 10);
                limits.put("syntheticChecks", 3);
            }
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("plan", plan);
        body.put("limits", limits);
        return ResponseEntity.ok(ApiResponse.ok(body));
    }
}
