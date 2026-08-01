package com.astrawatch.orchestrator.infrastructure.security;

import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.application.service.AuthService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final AuthService authService;
    private final UserRepository userRepository;

    public JwtAuthFilter(AuthService authService, UserRepository userRepository) {
        this.authService = authService;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String token = null;
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        } else if (request.getCookies() != null) {
            for (jakarta.servlet.http.Cookie cookie : request.getCookies()) {
                if ("accessToken".equals(cookie.getName())) {
                    token = cookie.getValue();
                    break;
                }
            }
        }

        if (token != null && !token.isBlank() && authService.verifyToken(token)) {
            String userId = authService.extractUserId(token);
            if (userId != null) {
                List<GrantedAuthority> authorities = resolveAuthorities(token, userId);
                if (!authorities.isEmpty()) {
                    UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                            userId, null, authorities
                    );
                    authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                }
            }
        }
        // No valid token, or user no longer exists → request stays unauthenticated; protected routes return 401/403.
        filterChain.doFilter(request, response);
    }

    /**
     * Resolve the authorities for a verified token subject.
     *
     * Real role-based authZ: the authority is derived from the user's actual role (default
     * VIEWER), never a blanket ROLE_ADMIN grant. A role claim embedded in the token is
     * used when present (avoids a DB hit per request); otherwise the role is loaded from
     * the database. Internal service-account tokens (subject "service-account") are
     * recognized separately.
     */
    private List<GrantedAuthority> resolveAuthorities(String token, String userId) {
        if ("service-account".equals(userId)) {
            return List.of(new SimpleGrantedAuthority("ROLE_SERVICE"));
        }

        String roleClaim = authService.extractRole(token);
        if (roleClaim != null && !roleClaim.isBlank()) {
            return List.of(new SimpleGrantedAuthority("ROLE_" + roleClaim.trim().toUpperCase()));
        }

        try {
            UUID id = UUID.fromString(userId);
            return userRepository.findById(id)
                    .map(u -> List.<GrantedAuthority>of(
                            new SimpleGrantedAuthority("ROLE_" + (u.getRole() != null ? u.getRole().toUpperCase() : "VIEWER"))))
                    .orElse(List.of());
        } catch (IllegalArgumentException e) {
            return List.of();
        }
    }
}
