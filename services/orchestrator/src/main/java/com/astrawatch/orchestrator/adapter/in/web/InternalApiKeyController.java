package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.application.service.AuthService;
import com.astrawatch.orchestrator.domain.model.ApiKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Internal endpoints consumed by other AstraWatch services (realtime gateway).
 * Guarded by the shared INTERNAL_API_TOKEN header — the same pattern the
 * collector uses — and never exposed to browsers. This is what lets the realtime
 * gateway validate WebSocket clients presenting a persisted API key (audit: the
 * gateway's in-memory key store was never populated, so API keys could never
 * authenticate).
 */
@RestController
@RequestMapping("/api/v1/internal")
public class InternalApiKeyController {

    private final AuthService authService;
    private final String internalToken;

    public InternalApiKeyController(AuthService authService,
                                    @Value("${astrawatch.internal-api-token:}") String internalToken) {
        this.authService = authService;
        this.internalToken = internalToken == null ? "" : internalToken;
    }

    @GetMapping("/api-keys")
    public ResponseEntity<?> listActiveApiKeys(@RequestHeader(value = "X-Internal-Token", required = false) String providedToken) {
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

        List<Map<String, Object>> keys = new ArrayList<>();
        for (ApiKey k : authService.listActiveApiKeys()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("keyHash", k.getKeyHash());
            row.put("userId", k.getUserId() != null ? k.getUserId().toString() : null);
            row.put("name", k.getName());
            // The stored permissions value is a JSON string (["read"]); emit a real
            // array so the gateway's socket.user.permissions is an array like JWT auth.
            row.put("permissions", parsePermissions(k.getPermissions()));
            row.put("tenantId", k.getTenantId());
            row.put("revoked", k.isRevoked());
            row.put("expiresAt", k.getExpiresAt() != null ? k.getExpiresAt().toString() : null);
            keys.add(row);
        }
        return ResponseEntity.ok(ApiResponse.ok(Map.of("keys", keys)));
    }

    private static List<String> parsePermissions(String raw) {
        if (raw == null || raw.isBlank()) return List.of("read");
        try {
            var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(raw);
            if (node != null && node.isArray()) {
                List<String> perms = new ArrayList<>();
                node.forEach(el -> { if (el.isTextual()) perms.add(el.asText()); });
                return perms.isEmpty() ? List.of("read") : perms;
            }
        } catch (Exception ignored) {
            // fall through to default
        }
        return List.of("read");
    }
}
