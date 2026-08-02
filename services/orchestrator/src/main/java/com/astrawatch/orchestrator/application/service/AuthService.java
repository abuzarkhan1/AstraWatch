package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.adapter.out.persistence.ApiKeyRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.InviteRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.SessionRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.domain.model.ApiKey;
import com.astrawatch.orchestrator.domain.model.Invite;
import com.astrawatch.orchestrator.domain.model.Session;
import com.astrawatch.orchestrator.domain.model.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;

import java.security.Key;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    @Value("${astrawatch.oauth.github.client-id:}")
    private String githubClientId;

    @Value("${astrawatch.oauth.github.client-secret:}")
    private String githubClientSecret;

    private final UserRepository userRepository;
    private final InviteRepository inviteRepository;
    private final ApiKeyRepository apiKeyRepository;
    private final SessionRepository sessionRepository;
    private final BCryptPasswordEncoder passwordEncoder;
    private final Key key;
    private final RestTemplate restTemplate;

    // ── Login lockout (audit: /auth/lockout/status returned canned values) ──
    private static final int MAX_LOGIN_ATTEMPTS = 5;
    private static final long LOCKOUT_SECONDS = 15 * 60;
    private final Map<String, LockoutState> lockoutByEmail = new ConcurrentHashMap<>();

    // Single-arg constructor kept for unit tests (OAuth paths only); the full
    // constructor is used by Spring and wires the real repositories.
    public AuthService(UserRepository userRepository) {
        this(userRepository, null, null, null);
    }

    @Autowired
    public AuthService(UserRepository userRepository,
                       InviteRepository inviteRepository,
                       ApiKeyRepository apiKeyRepository,
                       SessionRepository sessionRepository) {
        this.userRepository = userRepository;
        this.inviteRepository = inviteRepository;
        this.apiKeyRepository = apiKeyRepository;
        this.sessionRepository = sessionRepository;
        this.passwordEncoder = new BCryptPasswordEncoder();
        this.restTemplate = new RestTemplate();
        String secret = System.getenv("JWT_SECRET");
        if (secret == null || secret.isBlank()) {
            // System property fallback so unit tests (and local runners) can inject a secret
            // without exporting an env var.
            secret = System.getProperty("JWT_SECRET");
        }
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "JWT_SECRET environment variable must be set — refusing to start with a hardcoded signing key");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public Map<String, String> login(String email, String password) {
        String normalizedEmail = email != null ? email.trim().toLowerCase() : "";
        LockoutState lockout = lockoutByEmail.get(normalizedEmail);
        if (lockout != null && lockout.isLocked()) {
            throw new RuntimeException("Account temporarily locked. Try again in " + lockout.remainingSeconds() + "s.");
        }

        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isPresent() && userOpt.get().getPasswordHash() != null && passwordEncoder.matches(password, userOpt.get().getPasswordHash())) {
            lockoutByEmail.remove(normalizedEmail);
            String userId = userOpt.get().getId().toString();
            String accessToken = generateToken(userId, userOpt.get().getEmail(), null, userOpt.get().getRole());
            String refreshToken = generateRefreshToken(userId);
            Map<String, String> tokens = new HashMap<>();
            tokens.put("accessToken", accessToken);
            tokens.put("refreshToken", refreshToken);
            tokens.put("expiresIn", "900000");
            tokens.put("userId", userId);
            return tokens;
        }

        lockoutByEmail.computeIfAbsent(normalizedEmail, k -> new LockoutState()).recordFailure();
        throw new RuntimeException("Invalid credentials");
    }

    public User register(String email, String password) {
        if (userRepository.findByEmail(email).isPresent()) {
            throw new RuntimeException("Email already exists");
        }
        String code = generateVerificationCode();
        User user = User.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(password))
                .emailVerified(false)
                .emailVerificationToken(sha256(code))
                .emailVerificationExpiresAt(Instant.now().plus(Duration.ofHours(24)))
                .build();
        User saved = userRepository.save(user);
        // Dev/MailHog convenience: the verification code is logged so local flows
        // can complete without a real email provider.
        log.info("[VERIFY] Verification code for {} (dev/MailHog): {}", email, code);
        return saved;
    }

    public boolean verifyEmail(String code) {
        if (code == null || code.isBlank()) return false;
        String hash = sha256(code.trim());
        Optional<User> userOpt = userRepository.findByEmailVerificationToken(hash);
        if (userOpt.isEmpty()) return false;
        User user = userOpt.get();
        if (user.getEmailVerificationExpiresAt() != null && Instant.now().isAfter(user.getEmailVerificationExpiresAt())) {
            return false;
        }
        user.setEmailVerified(true);
        user.setEmailVerificationToken(null);
        user.setEmailVerificationExpiresAt(null);
        userRepository.save(user);
        return true;
    }

    public boolean resendVerification(String email) {
        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isEmpty()) return false;
        User user = userOpt.get();
        String code = generateVerificationCode();
        user.setEmailVerificationToken(sha256(code));
        user.setEmailVerificationExpiresAt(Instant.now().plus(Duration.ofHours(24)));
        userRepository.save(user);
        log.info("[VERIFY] New verification code for {} (dev/MailHog): {}", email, code);
        return true;
    }

    // ── Invitations (audit: acceptInvite threw UnsupportedOperationException) ──

    private static final Set<String> ALLOWED_ROLES = Set.of("VIEWER", "OPERATOR", "ADMIN");

    public Map<String, String> createInvite(String email, UUID teamId, String role, UUID invitedBy) {
        if (inviteRepository == null) throw new IllegalStateException("Invite repository not wired");
        String resolvedRole = role != null && !role.isBlank() ? role.trim().toUpperCase() : "VIEWER";
        if (!ALLOWED_ROLES.contains(resolvedRole)) {
            throw new RuntimeException("Invalid role: " + role + " (allowed: VIEWER, OPERATOR, ADMIN)");
        }
        String token = randomToken();
        Invite invite = Invite.builder()
                .email(email.trim().toLowerCase())
                .teamId(teamId)
                .role(resolvedRole)
                .tokenHash(sha256(token))
                .invitedBy(invitedBy)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build();
        Invite saved = inviteRepository.save(invite);
        Map<String, String> result = new LinkedHashMap<>();
        result.put("inviteId", saved.getId().toString());
        result.put("token", token);
        result.put("email", saved.getEmail());
        result.put("expiresAt", saved.getExpiresAt().toString());
        log.info("[INVITE] Created invite for {} id={}", saved.getEmail(), saved.getId());
        return result;
    }

    public Map<String, String> acceptInvite(String inviteToken) {
        if (inviteToken == null || inviteToken.isBlank()) throw new RuntimeException("Invite token is required");
        if (inviteRepository == null) throw new IllegalStateException("Invite repository not wired");

        Invite invite = inviteRepository.findByTokenHash(sha256(inviteToken))
                .orElseThrow(() -> new RuntimeException("Invalid invite token"));
        if (invite.isExpired()) throw new RuntimeException("Invite has expired");
        if (invite.isAccepted()) throw new RuntimeException("Invite has already been used");

        Optional<User> existing = userRepository.findByEmail(invite.getEmail());
        User user;
        if (existing.isPresent()) {
            // Link the existing account to the invited team instead of failing. Role
            // is only ever upgraded — an existing ADMIN is never demoted by a
            // lower-privilege invite.
            user = existing.get();
            if (roleRank(invite.getRole()) > roleRank(user.getRole())) {
                user.setRole(invite.getRole());
            }
            if (invite.getTeamId() != null) user.setTeamId(invite.getTeamId());
            user.setEmailVerified(true);
            user = userRepository.save(user);
        } else {
            // Random password so the account can't be logged into until the user
            // sets one via the reset-password flow; the invite is the proof of access.
            user = userRepository.save(User.builder()
                    .email(invite.getEmail())
                    .passwordHash(passwordEncoder.encode(UUID.randomUUID().toString()))
                    .role(invite.getRole())
                    .teamId(invite.getTeamId())
                    .emailVerified(true)
                    .build());
        }

        invite.setAcceptedAt(Instant.now());
        inviteRepository.save(invite);
        return issueTokens(user);
    }

    // ── API Keys (audit: endpoints fabricated ak_ tokens) ──

    public String createApiKey(UUID userId, String name) {
        if (apiKeyRepository == null) throw new IllegalStateException("API key repository not wired");
        String plaintext = "ak_" + randomToken();
        ApiKey key = ApiKey.builder()
                .userId(userId)
                .name(name != null && !name.isBlank() ? name : "default")
                .keyHash(sha256(plaintext))
                .keyPrefix(plaintext.substring(0, Math.min(8, plaintext.length())))
                .build();
        apiKeyRepository.save(key);
        return plaintext; // shown exactly once
    }

    public List<ApiKey> listApiKeys(UUID userId) {
        if (apiKeyRepository == null) return List.of();
        return apiKeyRepository.findAllByUserIdAndRevokedFalse(userId);
    }

    public boolean revokeApiKey(UUID userId, UUID keyId) {
        if (apiKeyRepository == null) return false;
        return apiKeyRepository.findById(keyId)
                .filter(k -> k.getUserId().equals(userId))
                .map(k -> {
                    k.setRevoked(true);
                    apiKeyRepository.save(k);
                    return true;
                })
                .orElse(false);
    }

    /**
     * Active (non-revoked, non-expired) API keys — consumed by the realtime
     * gateway over an internal-token-protected endpoint so WebSocket clients
     * authenticating with an API key are actually validated (audit: the
     * in-memory realtime key store was never populated).
     */
    public List<ApiKey> listActiveApiKeys() {
        if (apiKeyRepository == null) return List.of();
        return apiKeyRepository.findAllByRevokedFalse().stream()
                .filter(k -> !k.isExpired())
                .toList();
    }

    // ── Password management (audit: forgot/reset/change were canned) ──

    public void changePassword(UUID userId, String currentPassword, String newPassword) {
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        if (user.getPasswordHash() == null || !passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new RuntimeException("Current password is incorrect");
        }
        if (newPassword == null || newPassword.length() < 8) {
            throw new RuntimeException("New password must be at least 8 characters");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }

    public boolean forgotPassword(String email) {
        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isEmpty()) return false;
        User user = userOpt.get();
        String token = randomToken();
        user.setResetTokenHash(sha256(token));
        user.setResetTokenExpiresAt(Instant.now().plus(Duration.ofHours(1)));
        userRepository.save(user);
        // Dev/MailHog convenience: the reset token is logged so local flows can
        // complete without a real email provider.
        log.info("[RESET] Password reset for {} (dev/MailHog): token={}", email, token);
        return true;
    }

    public boolean resetPassword(String token, String newPassword) {
        if (token == null || token.isBlank()) return false;
        if (newPassword == null || newPassword.length() < 8) return false;
        Optional<User> userOpt = userRepository.findByResetTokenHash(sha256(token));
        if (userOpt.isEmpty()) return false;
        User user = userOpt.get();
        if (user.getResetTokenExpiresAt() == null || Instant.now().isAfter(user.getResetTokenExpiresAt())) {
            return false;
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setResetTokenHash(null);
        user.setResetTokenExpiresAt(null);
        userRepository.save(user);
        return true;
    }

    // ── Sessions (audit: /auth/sessions returned a fabricated row) ──

    public Session createSession(UUID userId, String device, String ip) {
        if (sessionRepository == null) return null;
        // Cap active sessions per user (keep the most recent MAX_SESSIONS); older
        // ones are revoked so the table does not grow unboundedly on every login.
        List<Session> active = sessionRepository.findAllByUserIdAndRevokedFalseOrderByLastActiveAtDesc(userId);
        if (active.size() >= MAX_SESSIONS_PER_USER) {
            for (int i = MAX_SESSIONS_PER_USER - 1; i < active.size(); i++) {
                Session stale = active.get(i);
                stale.setRevoked(true);
                sessionRepository.save(stale);
            }
        }
        return sessionRepository.save(Session.builder().userId(userId).device(device).ip(ip).build());
    }

    public List<Session> listSessions(UUID userId) {
        if (sessionRepository == null) return List.of();
        return sessionRepository.findAllByUserIdAndRevokedFalseOrderByLastActiveAtDesc(userId);
    }

    public boolean terminateSession(UUID userId, UUID sessionId) {
        if (sessionRepository == null) return false;
        return sessionRepository.findById(sessionId)
                .filter(s -> s.getUserId().equals(userId))
                .map(s -> {
                    s.setRevoked(true);
                    sessionRepository.save(s);
                    return true;
                })
                .orElse(false);
    }

    public void terminateAllSessions(UUID userId) {
        if (sessionRepository == null) return;
        for (Session s : sessionRepository.findAllByUserIdAndRevokedFalseOrderByLastActiveAtDesc(userId)) {
            s.setRevoked(true);
            sessionRepository.save(s);
        }
    }

    public Map<String, Object> lockoutStatus(String email) {
        Map<String, Object> result = new HashMap<>();
        if (email == null || email.isBlank()) {
            result.put("locked", false);
            result.put("remainingAttempts", MAX_LOGIN_ATTEMPTS);
            result.put("cooldownSeconds", 0);
            return result;
        }
        LockoutState state = lockoutByEmail.get(email.trim().toLowerCase());
        if (state == null || !state.isLocked()) {
            result.put("locked", false);
            result.put("remainingAttempts", MAX_LOGIN_ATTEMPTS);
            result.put("cooldownSeconds", 0);
        } else {
            result.put("locked", true);
            result.put("remainingAttempts", 0);
            result.put("cooldownSeconds", state.remainingSeconds());
        }
        return result;
    }

    public Map<String, String> processOAuth2Login(String provider, String code, String idToken, String accessToken, String providerId, String email, String name, String avatarUrl) {
        String resolvedEmail = email;
        String resolvedProviderId = providerId;

        Map<String, String> verified = new HashMap<>();
        if ("google".equalsIgnoreCase(provider)) {
            verified = verifyOrExchangeGoogleToken(code, idToken, accessToken);
            if (verified.get("email") != null) resolvedEmail = verified.get("email");
            if (verified.get("providerId") != null) resolvedProviderId = verified.get("providerId");
        } else if ("github".equalsIgnoreCase(provider)) {
            verified = verifyOrExchangeGitHubToken(code, accessToken);
            if (verified.get("email") != null) resolvedEmail = verified.get("email");
            if (verified.get("providerId") != null) resolvedProviderId = verified.get("providerId");
        }

        if (resolvedEmail == null || resolvedEmail.isBlank()) {
            resolvedEmail = provider + "_user_" + (resolvedProviderId != null ? resolvedProviderId : UUID.randomUUID().toString()) + "@astrawatch.io";
        }
        if (resolvedProviderId == null || resolvedProviderId.isBlank()) {
            resolvedProviderId = UUID.nameUUIDFromBytes(resolvedEmail.getBytes(StandardCharsets.UTF_8)).toString();
        }

        final String finalProviderId = resolvedProviderId;
        final String finalEmail = resolvedEmail;
        final String finalName = verified.get("name") != null ? verified.get("name") : name;
        final String finalAvatarUrl = verified.get("avatarUrl") != null ? verified.get("avatarUrl") : avatarUrl;

        User user = userRepository.findByOauthProviderAndOauthProviderId(provider, finalProviderId)
                .orElseGet(() -> userRepository.findByEmail(finalEmail)
                        .map(u -> {
                            u.setOauthProvider(provider);
                            u.setOauthProviderId(finalProviderId);
                            u.setEmailVerified(true);
                            return userRepository.save(u);
                        })
                        .orElseGet(() -> {
                            User newUser = User.builder()
                                    .email(finalEmail)
                                    .name(finalName)
                                    .avatarUrl(finalAvatarUrl)
                                    .passwordHash(passwordEncoder.encode(UUID.randomUUID().toString()))
                                    .oauthProvider(provider)
                                    .oauthProviderId(finalProviderId)
                                    .emailVerified(true)
                                    .build();
                            return userRepository.save(newUser);
                        }));

        // Sync profile fields on every login so they stay up to date
        boolean needsSave = false;
        if (user.getEmail() != null && user.getEmail().endsWith("@astrawatch.io")
                && !finalEmail.endsWith("@astrawatch.io")) {
            log.info("Updating placeholder email {} -> {} for {}/{}", user.getEmail(), finalEmail, provider, finalProviderId);
            user.setEmail(finalEmail);
            user.setEmailVerified(true);
            needsSave = true;
        }
        if (finalName != null && !finalName.isBlank() && !finalName.equals(user.getName())) {
            user.setName(finalName);
            needsSave = true;
        }
        if (finalAvatarUrl != null && !finalAvatarUrl.isBlank() && !finalAvatarUrl.equals(user.getAvatarUrl())) {
            user.setAvatarUrl(finalAvatarUrl);
            needsSave = true;
        }
        if (needsSave) {
            user = userRepository.save(user);
        }

        Map<String, String> result = issueTokens(user);
        result.put("provider", provider);
        return result;
    }

    private Map<String, String> issueTokens(User user) {
        String jwtToken = generateToken(user.getId().toString(), user.getEmail(), null, user.getRole());
        String refreshJwt = generateRefreshToken(user.getId().toString());

        Map<String, String> result = new HashMap<>();
        result.put("accessToken", jwtToken);
        result.put("refreshToken", refreshJwt);
        result.put("expiresIn", "900000");
        result.put("userId", user.getId().toString());
        result.put("email", user.getEmail());
        result.put("name", user.getName() != null ? user.getName() : "");
        result.put("avatarUrl", user.getAvatarUrl() != null ? user.getAvatarUrl() : "");
        result.put("role", user.getRole());
        return result;
    }

    private Map<String, String> verifyOrExchangeGoogleToken(String code, String idToken, String accessToken) {
        Map<String, String> result = new HashMap<>();
        log.info("verifyOrExchangeGoogleToken called with code: {}, idToken: {}, accessToken: {}", code != null, idToken != null, accessToken != null);
        try {
            if (idToken != null && !idToken.isBlank()) {
                String url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken;
                ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);
                log.info("Google tokeninfo response status: {}", response.getStatusCode());
                if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                    result.put("email", (String) response.getBody().get("email"));
                    result.put("providerId", (String) response.getBody().get("sub"));
                    result.put("name", (String) response.getBody().get("name"));
                    result.put("avatarUrl", (String) response.getBody().get("picture"));
                    return result;
                }
            }
            if (accessToken != null && !accessToken.isBlank()) {
                String url = "https://www.googleapis.com/oauth2/v3/userinfo";
                HttpHeaders headers = new HttpHeaders();
                headers.setBearerAuth(accessToken);
                HttpEntity<Void> entity = new HttpEntity<>(headers);
                ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.GET, entity, Map.class);
                log.info("Google userinfo response status: {}", response.getStatusCode());
                if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                    result.put("email", (String) response.getBody().get("email"));
                    result.put("providerId", (String) response.getBody().get("sub"));
                    result.put("name", (String) response.getBody().get("name"));
                    result.put("avatarUrl", (String) response.getBody().get("picture"));
                    return result;
                }
            }
        } catch (Exception e) {
            log.error("Google token verification failed with error", e);
        }
        return result;
    }

    private Map<String, String> verifyOrExchangeGitHubToken(String code, String accessToken) {
        Map<String, String> result = new HashMap<>();
        try {
            String tokenToUse = accessToken;
            if ((tokenToUse == null || tokenToUse.isBlank()) && code != null && !code.isBlank()) {
                String url = "https://github.com/login/oauth/access_token";
                HttpHeaders headers = new HttpHeaders();
                headers.setAccept(List.of(MediaType.APPLICATION_JSON));
                // Client credentials come from env (astrawatch.oauth.github.*). When
                // unset, the exchange intentionally fails instead of using placeholders.
                Map<String, String> body = Map.of(
                        "code", code,
                        "client_id", githubClientId != null ? githubClientId : "",
                        "client_secret", githubClientSecret != null ? githubClientSecret : ""
                );
                HttpEntity<Map<String, String>> entity = new HttpEntity<>(body, headers);
                ResponseEntity<Map> response = restTemplate.postForEntity(url, entity, Map.class);
                if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                    tokenToUse = (String) response.getBody().get("access_token");
                }
            }
            if (tokenToUse != null && !tokenToUse.isBlank()) {
                String url = "https://api.github.com/user";
                HttpHeaders headers = new HttpHeaders();
                headers.setBearerAuth(tokenToUse);
                HttpEntity<Void> entity = new HttpEntity<>(headers);
                ResponseEntity<Map> response = restTemplate.exchange(url, HttpMethod.GET, entity, Map.class);
                if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                    Object idObj = response.getBody().get("id");
                    if (idObj != null) result.put("providerId", String.valueOf(idObj));
                    String email = (String) response.getBody().get("email");
                    if (email != null) result.put("email", email);
                    String name = (String) response.getBody().get("name");
                    if (name != null) result.put("name", name);
                    String login = (String) response.getBody().get("login");
                    // Fall back to login as display name if name is blank
                    if ((name == null || name.isBlank()) && login != null) result.put("name", login);
                    String avatarUrl = (String) response.getBody().get("avatar_url");
                    if (avatarUrl != null) result.put("avatarUrl", avatarUrl);
                }
            }
        } catch (Exception e) {
            log.warn("GitHub token exchange/verification failed: {}", e.getMessage());
        }
        return result;
    }

    private String generateToken(String userId, String email, String teamId) {
        return generateToken(userId, email, teamId, null);
    }

    private String generateToken(String userId, String email, String teamId, String role) {
        var builder = Jwts.builder()
                .setSubject(userId)
                .claim("email", email)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + 900000));
        // The collector's ingest path derives the tenant from this claim; default to
        // "default" when the user has no team yet so HTTP ingestion never 401s.
        String tenantId = teamId != null ? teamId : "default";
        builder.claim("tenantId", tenantId);
        if (teamId != null) {
            builder.claim("teamId", teamId);
        }
        if (role != null && !role.isBlank()) {
            builder.claim("role", role);
        }
        return builder.signWith(key, SignatureAlgorithm.HS256).compact();
    }

    private String generateRefreshToken(String userId) {
        return Jwts.builder()
                .setSubject(userId)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + 86400000L)) // 24 hours
                .signWith(key, SignatureAlgorithm.HS256)
                .compact();
    }

    public String generateServiceToken(String serviceName) {
        return Jwts.builder()
                .setSubject("service-account")
                .claim("serviceName", serviceName)
                .claim("roles", "system")
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + 60000))
                .signWith(key, SignatureAlgorithm.HS256)
                .compact();
    }

    public boolean verifyToken(String token) {
        try {
            Jwts.parserBuilder().setSigningKey(key).build().parseClaimsJws(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public String extractUserId(String token) {
        try {
            return Jwts.parserBuilder().setSigningKey(key).build()
                    .parseClaimsJws(token).getBody().getSubject();
        } catch (Exception e) {
            return null;
        }
    }

    public String extractRole(String token) {
        try {
            Object role = Jwts.parserBuilder().setSigningKey(key).build()
                    .parseClaimsJws(token).getBody().get("role");
            return role != null ? String.valueOf(role) : null;
        } catch (Exception e) {
            return null;
        }
    }

    public Map<String, String> refresh(String refreshToken) {
        try {
            var claims = Jwts.parserBuilder().setSigningKey(key).build().parseClaimsJws(refreshToken).getBody();
            String userId = claims.getSubject();
            Optional<User> userOpt = userRepository.findById(UUID.fromString(userId));
            if (userOpt.isPresent()) {
                String newAccess = generateToken(userId, userOpt.get().getEmail(), null, userOpt.get().getRole());
                String newRefresh = generateRefreshToken(userId);
                Map<String, String> tokens = new HashMap<>();
                tokens.put("accessToken", newAccess);
                tokens.put("refreshToken", newRefresh);
                tokens.put("expiresIn", "900000");
                return tokens;
            }
        } catch (Exception e) {
            // fall through
        }
        throw new RuntimeException("Invalid refresh token");
    }

    public String switchTeam(String teamId, String accessToken) {
        try {
            var claims = Jwts.parserBuilder().setSigningKey(key).build().parseClaimsJws(accessToken).getBody();
            String userId = claims.getSubject();
            String email = claims.get("email", String.class);
            Object role = claims.get("role");
            return generateToken(userId, email, teamId, role != null ? String.valueOf(role) : null);
        } catch (Exception e) {
            throw new RuntimeException("Invalid access token");
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    private static final int MAX_SESSIONS_PER_USER = 10;

    /** Higher number = more privileged. Used so invites never demote a user. */
    private static int roleRank(String role) {
        if (role == null) return 1;
        switch (role.trim().toUpperCase()) {
            case "ADMIN": return 3;
            case "OPERATOR": return 2;
            default: return 1; // VIEWER and unknown
        }
    }

    private static String sha256(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(value.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static String randomToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String generateVerificationCode() {
        return String.format("%06d", new SecureRandom().nextInt(1_000_000));
    }

    /** In-memory per-email failed-login tracker with cooldown. */
    public static class LockoutState {
        private int attempts = 0;
        private long lockUntilEpochMillis = 0;

        public void recordFailure() {
            attempts++;
            if (attempts >= MAX_LOGIN_ATTEMPTS) {
                lockUntilEpochMillis = System.currentTimeMillis() + LOCKOUT_SECONDS * 1000;
                attempts = 0;
            }
        }

        public boolean isLocked() {
            if (lockUntilEpochMillis > 0 && System.currentTimeMillis() < lockUntilEpochMillis) {
                return true;
            }
            if (lockUntilEpochMillis > 0 && System.currentTimeMillis() >= lockUntilEpochMillis) {
                lockUntilEpochMillis = 0;
                attempts = 0;
            }
            return false;
        }

        public int remainingSeconds() {
            long rem = (lockUntilEpochMillis - System.currentTimeMillis()) / 1000;
            return (int) Math.max(0, rem);
        }

        public int getAttempts() { return attempts; }
        public boolean isLockedOut() { return isLocked(); }
        public long getLockUntilEpochMillis() { return lockUntilEpochMillis; }
    }
}
