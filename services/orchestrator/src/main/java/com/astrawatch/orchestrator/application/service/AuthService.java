package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.domain.model.User;
import org.springframework.stereotype.Service;
import java.util.Optional;
import java.util.UUID;
import java.util.Map;
import java.util.HashMap;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import java.security.Key;
import java.util.Date;

@Service
public class AuthService {

    public static final String SECRET_KEY_STRING = "astrawatch-super-secret-jwt-token-signing-key-2026-secure-32bytes-long!";

    private final UserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder;
    private final Key key = Keys.hmacShaKeyFor(SECRET_KEY_STRING.getBytes(java.nio.charset.StandardCharsets.UTF_8));

    public AuthService(UserRepository userRepository) {
        this.userRepository = userRepository;
        this.passwordEncoder = new BCryptPasswordEncoder();
    }

    public Map<String, String> login(String email, String password) {
        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isPresent() && passwordEncoder.matches(password, userOpt.get().getPasswordHash())) {
            String userId = userOpt.get().getId().toString();
            String accessToken = generateToken(userId, userOpt.get().getEmail(), null);
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
                .build();
        return userRepository.save(user);
    }

    private String generateToken(String userId, String email, String teamId) {
        var builder = Jwts.builder()
                .setSubject(userId)
                .claim("email", email)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + 900000));
        if (teamId != null) {
            builder.claim("teamId", teamId);
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
                .setExpiration(new Date(System.currentTimeMillis() + 60000)) // 1 min short-lived
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

    public Map<String, String> refresh(String refreshToken) {
        try {
            var claims = Jwts.parserBuilder().setSigningKey(key).build().parseClaimsJws(refreshToken).getBody();
            String userId = claims.getSubject();
            Optional<User> userOpt = userRepository.findById(UUID.fromString(userId));
            if (userOpt.isPresent()) {
                String newAccess = generateToken(userId, userOpt.get().getEmail(), null);
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
            // Verify if user belongs to team in DB...
            return generateToken(userId, email, teamId);
        } catch (Exception e) {
            throw new RuntimeException("Invalid access token");
        }
    }

    public Map<String, String> acceptInvite(String inviteToken) {
        // Mock logic for accepting invite
        String mockUserId = UUID.randomUUID().toString();
        String newAccess = generateToken(mockUserId, "invited@astrawatch.io", null);
        String newRefresh = generateRefreshToken(mockUserId);
        Map<String, String> tokens = new HashMap<>();
        tokens.put("accessToken", newAccess);
        tokens.put("refreshToken", newRefresh);
        return tokens;
    }
}
