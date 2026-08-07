package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.domain.model.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Internal billing endpoint consumed by the payment-service webhook path.
 * Guarded by the shared INTERNAL_API_TOKEN header — the same pattern as
 * InternalApiKeyController and the collector's internal middleware — so the
 * public billing routes stay behind JWT while service-to-service updates
 * (plan tier changes) use the internal token.
 *
 * This closes audit gap 1.5: previously a successful Stripe checkout updated
 * only the payment service's own store and the user's plan never changed here,
 * so entitlements could never be enforced.
 */
@RestController
@RequestMapping("/api/v1/internal/billing")
public class InternalBillingController {

    private final UserRepository userRepository;
    private final String internalToken;

    public InternalBillingController(UserRepository userRepository,
                                     @Value("${astrawatch.internal-api-token:}") String internalToken) {
        this.userRepository = userRepository;
        this.internalToken = internalToken == null ? "" : internalToken;
    }

    @PostMapping("/plan-changed")
    public ResponseEntity<?> planChanged(@RequestHeader(value = "X-Internal-Token", required = false) String providedToken,
                                         @RequestBody(required = false) Map<String, String> body) {
        if (internalToken.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(new ApiResponse<>(false, Map.of("error", "INTERNAL_API_TOKEN not configured on orchestrator"), Map.of()));
        }
        if (providedToken == null || !MessageDigest.isEqual(
                providedToken.getBytes(StandardCharsets.UTF_8),
                internalToken.getBytes(StandardCharsets.UTF_8))) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse<>(false, Map.of("error", "invalid internal token"), Map.of()));
        }

        if (body == null || body.get("userId") == null || body.get("userId").isBlank()) {
            return ResponseEntity.badRequest()
                    .body(new ApiResponse<>(false, Map.of("error", "userId is required"), Map.of()));
        }

        UUID userId;
        try {
            userId = UUID.fromString(body.get("userId"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(new ApiResponse<>(false, Map.of("error", "invalid userId"), Map.of()));
        }

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new ApiResponse<>(false, Map.of("error", "user not found"), Map.of()));
        }

        User user = userOpt.get();
        String status = body.get("status") != null ? body.get("status") : "active";
        if ("canceled".equalsIgnoreCase(status) || "past_due".equalsIgnoreCase(status) || "unpaid".equalsIgnoreCase(status)) {
            user.setPlan("free");
        } else if (body.get("plan") != null && !body.get("plan").isBlank()) {
            user.setPlan(body.get("plan").toLowerCase());
        }
        userRepository.save(user);

        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "userId", user.getId().toString(),
                "plan", user.getPlan(),
                "status", status
        )));
    }
}
