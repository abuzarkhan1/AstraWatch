package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.domain.model.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;

import java.security.Key;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    @Value("${astrawatch.oauth.github.client-id:}")
    private String githubClientId;

    @Value("${astrawatch.oauth.github.client-secret:}")
    private String githubClientSecret;

    private final UserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder;
    private final Key key;
    private final RestTemplate restTemplate;

    public AuthService(UserRepository userRepository) {
        this.userRepository = userRepository;
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
        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isPresent() && userOpt.get().getPasswordHash() != null && passwordEncoder.matches(password, userOpt.get().getPasswordHash())) {
            String userId = userOpt.get().getId().toString();
            String accessToken = generateToken(userId, userOpt.get().getEmail(), null, userOpt.get().getRole());
            String refreshToken = generateRefreshToken(userId);
            Map<String, String> tokens = new HashMap<>();
            tokens.put("accessToken", accessToken);
            tokens.put("refreshToken", refreshToken);
            tokens.put("expiresIn", "900000");
            return tokens;
        }
        throw new RuntimeException("Invalid credentials");
    }

    public User register(String email, String password) {
        if (userRepository.findByEmail(email).isPresent()) {
            throw new RuntimeException("Email already exists");
        }
        User user = User.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(password))
                .emailVerified(false)
                .build();
        return userRepository.save(user);
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
        result.put("provider", provider);
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

    public Map<String, String> acceptInvite(String inviteToken) {
        throw new UnsupportedOperationException("acceptInvite not implemented yet. Dummy data generation removed.");
    }
}
