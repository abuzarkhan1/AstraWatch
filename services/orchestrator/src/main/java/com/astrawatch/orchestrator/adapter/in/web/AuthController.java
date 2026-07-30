package com.astrawatch.orchestrator.adapter.in.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.astrawatch.orchestrator.application.service.AuthService;
import com.astrawatch.orchestrator.domain.model.User;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<Map<String, String>>> login(@RequestBody Map<String, String> body) {
        try {
            String token = authService.login(body.get("email"), body.get("password"));
            return ResponseEntity.ok(ApiResponse.ok(Map.of(
                    "accessToken", token,
                    "refreshToken", "mock-refresh-token",
                    "expiresIn", "900000"
            )));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ApiResponse<>(false, Map.of("error", "Invalid credentials"), Map.of()));
        }
    }

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<Map<String, Object>>> register(@RequestBody Map<String, String> body) {
        try {
            User user = authService.register(body.get("email"), body.get("password"));
            return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(Map.of(
                    "userId", user.getId().toString(),
                    "requiresVerification", true
            )));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ApiResponse<>(false, Map.of("error", e.getMessage()), Map.of()));
        }
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<Map<String, String>>> refresh(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "accessToken", "mock-refreshed-jwt",
                "expiresIn", "900"
        )));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<Map<String, Object>>> me() {
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "userId", UUID.randomUUID().toString(),
                "email", "admin@astrawatch.io",
                "roles", List.of("PlatformAdmin"),
                "permissions", List.of("*")
        )));
    }

    // ─── Email Verification ─────────────────────────────────────────────

    @PostMapping("/verify-email")
    public ResponseEntity<ApiResponse<Map<String, Object>>> verifyEmail(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("verified", true)));
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<Void> resendVerification(@RequestBody Map<String, String> body) {
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<Void> forgotPassword(@RequestBody Map<String, String> body) {
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponse<Map<String, Object>>> resetPassword(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("success", true)));
    }

    @PostMapping("/change-password")
    public ResponseEntity<ApiResponse<Map<String, Object>>> changePassword(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("success", true)));
    }

    @PostMapping("/switch-team")
    public ResponseEntity<ApiResponse<Map<String, Object>>> switchTeam(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("accessToken", "mock-team-jwt")));
    }

    // ─── MFA ────────────────────────────────────────────────────────────

    @PostMapping("/mfa/setup")
    public ResponseEntity<ApiResponse<Map<String, Object>>> setupMfa() {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(Map.of(
                "secret", "JBSWY3DPEHPK3PXP",
                "qrCodeUrl", "otpauth://totp/AstraWatch:admin@astrawatch.io?secret=JBSWY3DPEHPK3PXP&issuer=AstraWatch",
                "backupCodes", List.of("1234567890", "2345678901", "3456789012", "4567890123", "5678901234",
                                         "6789012345", "7890123456", "8901234567", "9012345678", "0123456789")
        )));
    }

    @PostMapping("/mfa/verify")
    public ResponseEntity<ApiResponse<Map<String, Object>>> verifyMfa(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("enabled", true)));
    }

    @PostMapping("/mfa/disable")
    public ResponseEntity<ApiResponse<Map<String, Object>>> disableMfa(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("disabled", true)));
    }

    // ─── Lockout Status ─────────────────────────────────────────────────

    @GetMapping("/lockout/status")
    public ResponseEntity<ApiResponse<Map<String, Object>>> lockoutStatus() {
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "locked", false,
                "remainingAttempts", 5,
                "cooldownSeconds", 0
        )));
    }

    // ─── Session Management ─────────────────────────────────────────────

    @GetMapping("/sessions")
    public ResponseEntity<ApiResponse<Map<String, Object>>> listSessions() {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("sessions", List.of(Map.of(
                "id", UUID.randomUUID().toString(),
                "device", "Mozilla/5.0",
                "ip", "192.168.1.1",
                "lastActive", Instant.now().toString(),
                "createdAt", Instant.now().toString()
        )))));
    }

    @DeleteMapping("/sessions/{id}")
    public ResponseEntity<Void> terminateSession(@PathVariable UUID id) {
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/sessions")
    public ResponseEntity<Void> terminateAllSessions() {
        return ResponseEntity.noContent().build();
    }

    // ─── API Keys ───────────────────────────────────────────────────────

    @PostMapping("/api-keys")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createApiKey(@RequestBody Map<String, Object> body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(Map.of(
                "id", UUID.randomUUID().toString(),
                "key", "ak_" + UUID.randomUUID().toString().replace("-", ""),
                "createdAt", Instant.now().toString()
        )));
    }

    @GetMapping("/api-keys")
    public ResponseEntity<ApiResponse<Map<String, Object>>> listApiKeys() {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("keys", List.of())));
    }

    @DeleteMapping("/api-keys/{id}")
    public ResponseEntity<Void> revokeApiKey(@PathVariable UUID id) {
        return ResponseEntity.noContent().build();
    }

    // ─── Invitations ────────────────────────────────────────────────────

    @PostMapping("/invite")
    public ResponseEntity<ApiResponse<Map<String, Object>>> inviteUser(@RequestBody Map<String, String> body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(Map.of("inviteId", UUID.randomUUID().toString())));
    }

    @PostMapping("/accept-invite")
    public ResponseEntity<ApiResponse<Map<String, Object>>> acceptInvite(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "accessToken", "mock-jwt-from-invite",
                "refreshToken", "mock-refresh-from-invite"
        )));
    }
}
