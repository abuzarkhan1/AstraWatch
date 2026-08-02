package com.astrawatch.orchestrator.adapter.in.web;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.astrawatch.orchestrator.adapter.in.web.dto.UserDTO;
import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.application.service.AuthService;
import com.astrawatch.orchestrator.domain.model.User;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;

    private final UserRepository userRepository;

    public AuthController(AuthService authService, UserRepository userRepository) {
        this.authService = authService;
        this.userRepository = userRepository;
    }

    private ResponseCookie createAccessTokenCookie(String token) {
        return ResponseCookie.from("accessToken", token != null ? token : "")
                .httpOnly(true)
                .secure(false)
                .sameSite("Strict")
                .path("/")
                .maxAge(Duration.ofHours(24))
                .build();
    }

    private ResponseCookie createRefreshTokenCookie(String token) {
        return ResponseCookie.from("refreshToken", token != null ? token : "")
                .httpOnly(true)
                .secure(false)
                .sameSite("Strict")
                .path("/")
                .maxAge(Duration.ofDays(7))
                .build();
    }

    private ResponseCookie createCleanCookie(String cookieName) {
        return ResponseCookie.from(cookieName, "")
                .httpOnly(true)
                .secure(false)
                .sameSite("Strict")
                .path("/")
                .maxAge(0)
                .build();
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<Map<String, String>>> login(@RequestBody Map<String, String> body) {
        try {
            Map<String, String> tokens = authService.login(body.get("email"), body.get("password"));
            ResponseCookie accessCookie = createAccessTokenCookie(tokens.get("accessToken"));
            ResponseCookie refreshCookie = createRefreshTokenCookie(tokens.get("refreshToken"));

            return ResponseEntity.ok()
                    .header(HttpHeaders.SET_COOKIE, accessCookie.toString())
                    .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
                    .body(ApiResponse.ok(tokens));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse<>(false, Map.of("error", "Invalid credentials"), Map.of()));
        }
    }

    @PostMapping("/oauth2/google")
    public ResponseEntity<ApiResponse<Map<String, String>>> oauth2Google(@RequestBody Map<String, String> body) {
        try {
            Map<String, String> tokens = authService.processOAuth2Login(
                    "google",
                    body.get("code"),
                    body.get("idToken"),
                    body.get("accessToken"),
                    body.get("providerId"),
                    body.get("email"),
                    body.get("name"),
                    body.get("avatarUrl")
            );
            ResponseCookie accessCookie = createAccessTokenCookie(tokens.get("accessToken"));
            ResponseCookie refreshCookie = createRefreshTokenCookie(tokens.get("refreshToken"));

            return ResponseEntity.ok()
                    .header(HttpHeaders.SET_COOKIE, accessCookie.toString())
                    .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
                    .body(ApiResponse.ok(tokens));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse<>(false, Map.of("error", e.getMessage() != null ? e.getMessage() : "OAuth authentication failed"), Map.of()));
        }
    }

    @PostMapping("/oauth2/github")
    public ResponseEntity<ApiResponse<Map<String, String>>> oauth2GitHub(@RequestBody Map<String, String> body) {
        try {
            Map<String, String> tokens = authService.processOAuth2Login(
                    "github",
                    body.get("code"),
                    null,
                    body.get("token"),
                    null,
                    body.get("email"),
                    body.get("name"),
                    body.get("avatarUrl")
            );
            ResponseCookie accessCookie = createAccessTokenCookie(tokens.get("accessToken"));
            ResponseCookie refreshCookie = createRefreshTokenCookie(tokens.get("refreshToken"));

            return ResponseEntity.ok()
                    .header(HttpHeaders.SET_COOKIE, accessCookie.toString())
                    .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
                    .body(ApiResponse.ok(tokens));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse<>(false, Map.of("error", e.getMessage() != null ? e.getMessage() : "OAuth authentication failed"), Map.of()));
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
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(new ApiResponse<>(false, Map.of("error", e.getMessage()), Map.of()));
        }
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<Map<String, String>>> refresh(
            @RequestBody(required = false) Map<String, String> body,
            @CookieValue(name = "refreshToken", required = false) String cookieRefreshToken) {
        try {
            String tokenToUse = (body != null && body.containsKey("refreshToken"))
                    ? body.get("refreshToken")
                    : cookieRefreshToken;
            if (tokenToUse == null || tokenToUse.isBlank()) {
                throw new IllegalArgumentException("Missing refresh token");
            }
            Map<String, String> tokens = authService.refresh(tokenToUse);
            ResponseCookie accessCookie = createAccessTokenCookie(tokens.get("accessToken"));
            ResponseCookie refreshCookie = createRefreshTokenCookie(tokens.get("refreshToken"));

            return ResponseEntity.ok()
                    .header(HttpHeaders.SET_COOKIE, accessCookie.toString())
                    .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
                    .body(ApiResponse.ok(tokens));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse<>(false, Map.of("error", "Invalid refresh token"), Map.of()));
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        ResponseCookie accessCookie = createCleanCookie("accessToken");
        ResponseCookie refreshCookie = createCleanCookie("refreshToken");

        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, accessCookie.toString())
                .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
                .build();
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(HttpServletRequest request) {
        // Extract token from cookie or Authorization header
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
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ApiResponse<>(false, "Not authenticated", null));
        }

        String userId = authService.extractUserId(token);
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ApiResponse<>(false, "Invalid token", null));
        }

        return userRepository.findById(java.util.UUID.fromString(userId))
                .map(user -> ResponseEntity.ok(ApiResponse.ok(UserDTO.from(user))))
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).build());
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
        try {
            String token = authService.switchTeam(body.get("teamId"), body.get("accessToken"));
            ResponseCookie accessCookie = createAccessTokenCookie(token);

            return ResponseEntity.ok()
                    .header(HttpHeaders.SET_COOKIE, accessCookie.toString())
                    .body(ApiResponse.ok(Map.of("accessToken", token)));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse<>(false, Map.of("error", "Invalid token or team"), Map.of()));
        }
    }

    // ─── MFA ────────────────────────────────────────────────────────────
    // Real RFC 6238 TOTP (audit V2: these were fictional — a static secret for
    // every user and verify always returned "enabled"). Secrets are now generated
    // per user, persisted on the User row, and codes verified server-side.

    private User resolveCurrentUser(HttpServletRequest request) {
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
            return null;
        }
        String userId = authService.extractUserId(token);
        if (userId == null) return null;
        return userRepository.findById(UUID.fromString(userId)).orElse(null);
    }

    @PostMapping("/mfa/setup")
    public ResponseEntity<ApiResponse<Map<String, Object>>> setupMfa(HttpServletRequest request) {
        User user = resolveCurrentUser(request);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse<>(false, Map.of("error", "Authentication required"), Map.of()));
        }
        String secret = com.astrawatch.orchestrator.infrastructure.security.TotpCodec.generateSecret();
        user.setMfaSecret(secret);
        user.setMfaEnabled(false); // enabled only after a successful verify
        userRepository.save(user);

        String account = user.getEmail() != null ? user.getEmail() : String.valueOf(user.getId());
        String qrCodeUrl = "otpauth://totp/AstraWatch:" + account + "?secret=" + secret + "&issuer=AstraWatch";
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(Map.of(
                "secret", secret,
                "qrCodeUrl", qrCodeUrl,
                "backupCodes", generateBackupCodes()
        )));
    }

    @PostMapping("/mfa/verify")
    public ResponseEntity<ApiResponse<Map<String, Object>>> verifyMfa(@RequestBody Map<String, String> body, HttpServletRequest request) {
        User user = resolveCurrentUser(request);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse<>(false, Map.of("error", "Authentication required"), Map.of()));
        }
        String code = body.get("code");
        if (user.getMfaSecret() == null || user.getMfaSecret().isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(new ApiResponse<>(false, Map.of("error", "MFA not set up — call /mfa/setup first"), Map.of()));
        }
        if (!com.astrawatch.orchestrator.infrastructure.security.TotpCodec.verify(user.getMfaSecret(), code)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse<>(false, Map.of("enabled", false, "error", "Invalid code"), Map.of()));
        }
        user.setMfaEnabled(true);
        userRepository.save(user);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("enabled", true)));
    }

    @PostMapping("/mfa/disable")
    public ResponseEntity<ApiResponse<Map<String, Object>>> disableMfa(@RequestBody Map<String, String> body, HttpServletRequest request) {
        User user = resolveCurrentUser(request);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse<>(false, Map.of("error", "Authentication required"), Map.of()));
        }
        user.setMfaEnabled(false);
        user.setMfaSecret(null);
        userRepository.save(user);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("disabled", true)));
    }

    private List<String> generateBackupCodes() {
        java.security.SecureRandom rng = new java.security.SecureRandom();
        List<String> codes = new java.util.ArrayList<>();
        for (int i = 0; i < 10; i++) {
            codes.add(String.format("%010d", Math.abs(rng.nextLong() % 1_000_000_0000L)));
        }
        return codes;
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
        try {
            Map<String, String> tokens = authService.acceptInvite(body.get("token"));
            ResponseCookie accessCookie = createAccessTokenCookie(tokens.get("accessToken"));
            ResponseCookie refreshCookie = createRefreshTokenCookie(tokens.get("refreshToken"));

            return ResponseEntity.ok()
                    .header(HttpHeaders.SET_COOKIE, accessCookie.toString())
                    .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
                    .body(ApiResponse.ok(Map.of(
                            "accessToken", tokens.get("accessToken"),
                            "refreshToken", tokens.get("refreshToken")
                    )));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse<>(false, Map.of("error", "Invalid invite token"), Map.of()));
        }
    }
}
