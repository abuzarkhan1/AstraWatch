package com.astrawatch.orchestrator.infrastructure.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.util.ContentCachingResponseWrapper;
import org.springframework.jdbc.core.JdbcTemplate;
import java.nio.charset.StandardCharsets;

import java.io.IOException;
import java.util.List;

@Component
@Order(1)
public class IdempotencyFilter implements Filter {

    private final JdbcTemplate jdbcTemplate;

    public IdempotencyFilter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        String method = httpRequest.getMethod();
        if (HttpMethod.POST.matches(method) || HttpMethod.PUT.matches(method)) {
            String idempotencyKey = httpRequest.getHeader("Idempotency-Key");
            if (idempotencyKey != null && !idempotencyKey.isBlank()) {
                String selectSql = "SELECT response_snapshot FROM idempotency_keys WHERE key = ?";
                List<String> results = jdbcTemplate.query(selectSql, (rs, rowNum) -> rs.getString("response_snapshot"), idempotencyKey);
                if (!results.isEmpty()) {
                    String cached = results.get(0);
                    if (cached != null) {
                        httpResponse.setStatus(200);
                        httpResponse.setContentType("application/json");
                        httpResponse.getOutputStream().write(cached.getBytes(StandardCharsets.UTF_8));
                        return;
                    }
                }

                ContentCachingResponseWrapper wrappedResponse = new ContentCachingResponseWrapper(httpResponse);
                chain.doFilter(request, wrappedResponse);
                wrappedResponse.copyBodyToResponse();

                byte[] body = wrappedResponse.getContentAsByteArray();
                String bodyStr = new String(body, StandardCharsets.UTF_8);
                
                try {
                    String insertSql = "INSERT INTO idempotency_keys (key, endpoint, response_snapshot) VALUES (?, ?, ?::jsonb) ON CONFLICT (key) DO NOTHING";
                    jdbcTemplate.update(insertSql, idempotencyKey, httpRequest.getRequestURI(), bodyStr);
                } catch (Exception e) {
                    // Ignore DB errors on insert
                }
                return;
            }
        }

        chain.doFilter(request, response);
    }
}

