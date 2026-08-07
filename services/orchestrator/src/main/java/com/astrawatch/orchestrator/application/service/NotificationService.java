package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.application.port.in.NotificationPort;
import com.astrawatch.orchestrator.application.port.out.NotificationRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.IncidentRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.domain.model.*;
import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class NotificationService implements NotificationPort {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository notificationRepository;
    private final JavaMailSender mailSender;
    private final TemplateEngine templateEngine;
    private final UserRepository userRepository;
    private final IncidentRepository incidentRepository;

    @Value("${astrawatch.mail.from:noreply@astrawatch.io}")
    private String mailFrom = "noreply@astrawatch.io";

    @Value("${astrawatch.mail.recipient:admin@astrawatch.io}")
    private String defaultRecipient = "admin@astrawatch.io";

    @Value("${astrawatch.mail.unsubscribe-secret:}")
    private String unsubscribeSecret = "";

    @Value("${astrawatch.dashboard.url:http://localhost:3000}")
    private String dashboardUrl = "http://localhost:3000";

    private final Set<String> unsubscribedEmails = ConcurrentHashMap.newKeySet();

    @jakarta.annotation.PostConstruct
    public void ensureUnsubscribeSecret() {
        // No hardcoded fallback secret. If not configured via env, generate an
        // ephemeral per-boot secret so unsubscribe/action tokens are unforgeable
        // (they simply do not survive a restart).
        if (unsubscribeSecret == null || unsubscribeSecret.isBlank()) {
            unsubscribeSecret = UUID.randomUUID().toString().replace("-", "")
                    + UUID.randomUUID().toString().replace("-", "");
            log.warn("astrawatch.mail.unsubscribe-secret not set — generated ephemeral secret; "
                    + "previously issued unsubscribe/approve/reject tokens will not survive a restart");
        }
    }

    public NotificationService(NotificationRepository notificationRepository,
                               Optional<JavaMailSender> mailSender,
                               Optional<TemplateEngine> templateEngine) {
        this(notificationRepository, mailSender, templateEngine, null, null);
    }

    @Autowired
    public NotificationService(NotificationRepository notificationRepository,
                               Optional<JavaMailSender> mailSender,
                               Optional<TemplateEngine> templateEngine,
                               @Autowired(required = false) UserRepository userRepository,
                               @Autowired(required = false) IncidentRepository incidentRepository) {
        this.notificationRepository = notificationRepository;
        this.mailSender = mailSender.orElse(null);
        this.templateEngine = templateEngine.orElse(null);
        this.userRepository = userRepository;
        this.incidentRepository = incidentRepository;
    }

    public List<NotificationChannel> getChannels(UUID orgId) {
        return notificationRepository.findChannelsByOrgId(orgId);
    }

    public NotificationChannel createChannel(NotificationChannel channel) {
        return notificationRepository.saveChannel(channel);
    }

    public Optional<NotificationChannel> updateChannel(UUID id, String config) {
        return notificationRepository.findChannelById(id).map(ch -> {
            ch.setConfig(config);
            return notificationRepository.saveChannel(ch);
        });
    }

    @Transactional
    public void deleteChannel(UUID id) {
        notificationRepository.deleteChannelById(id);
    }

    public List<NotificationRule> getRules(UUID orgId) {
        return notificationRepository.findRulesByOrgId(orgId);
    }

    public NotificationRule createRule(NotificationRule rule) {
        return notificationRepository.saveRule(rule);
    }

    /**
     * Toggles a notification rule's enabled flag (audit: alerting UI had no
     * backend to persist rule state — the frontend toggled local-only).
     */
    public Optional<NotificationRule> setRuleEnabled(UUID id, boolean enabled) {
        return notificationRepository.findRuleById(id).map(rule -> {
            rule.setEnabled(enabled);
            return notificationRepository.saveRule(rule);
        });
    }

    /**
     * Actually dispatches a test payload through a channel adapter and returns
     * the real result (audit: testChannel returned a fabricated success).
     */
    public Map<String, Object> testChannelDelivery(UUID id) {
        Optional<NotificationChannel> opt = notificationRepository.findChannelById(id);
        if (opt.isEmpty()) {
            return Map.of("delivered", false, "error", "Channel not found", "responseCode", 404);
        }
        NotificationChannel ch = opt.get();
        String url = extractUrl(ch.getConfig());
        if (url == null || url.isBlank()) {
            return Map.of("delivered", false, "error", "Channel config has no valid url", "responseCode", 0);
        }
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(
                            "{\"text\":\"[AstraWatch] Test notification\",\"message\":\"This is a test from the AstraWatch alerting center.\"}"))
                    .timeout(java.time.Duration.ofSeconds(10))
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            boolean ok = resp.statusCode() >= 200 && resp.statusCode() < 300;
            return Map.of("delivered", ok, "responseCode", resp.statusCode(),
                    "channel", ch.getName() != null ? ch.getName() : "");
        } catch (Exception e) {
            return Map.of("delivered", false, "error", e.getMessage() != null ? e.getMessage() : "delivery failed", "responseCode", 0);
        }
    }

    /**
     * Simulates a rule match and returns the channels that would receive the
     * alert, with their config state (audit: testRule returned a fabricated
     * empty summary).
     */
    public Map<String, Object> testRuleDelivery(UUID id) {
        Optional<NotificationRule> opt = notificationRepository.findRuleById(id);
        if (opt.isEmpty()) {
            return Map.of("matched", false, "error", "Rule not found", "deliveries", List.of());
        }
        NotificationRule rule = opt.get();
        List<Map<String, Object>> deliveries = new ArrayList<>();
        for (NotificationChannel ch : notificationRepository.findAllChannels()) {
            if (ch == null || !ch.isEnabled()) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("channelId", ch.getId() != null ? ch.getId().toString() : "");
            row.put("name", ch.getName());
            row.put("type", ch.getType());
            row.put("configured", ch.getConfig() != null && !ch.getConfig().isBlank());
            deliveries.add(row);
        }
        return Map.of("matched", true, "rule", rule.getName() != null ? rule.getName() : "", "deliveries", deliveries);
    }

    public List<NotificationPreference> getPreferences(UUID userId) {
        return notificationRepository.findPreferencesByUserId(userId);
    }

    public List<MaintenanceWindow> getMaintenanceWindows(UUID orgId) {
        return notificationRepository.findMaintenanceWindowsByOrgId(orgId);
    }

    public MaintenanceWindow createMaintenanceWindow(MaintenanceWindow window) {
        return notificationRepository.saveMaintenanceWindow(window);
    }

    @Transactional
    public void deleteMaintenanceWindow(UUID id) {
        notificationRepository.deleteMaintenanceWindowById(id);
    }

    /**
     * Resolve the actual notification recipients for an incident (audit F6).
     *
     * Order of preference:
     *   1. The user explicitly assigned to the incident (incident.assignedTo).
     *   2. Active members of that user's team (service owners / on-call pool).
     *   3. Fall back to the configured admin recipient (never a hardcoded dead-end).
     *
     * Emails are deduplicated and unsubscribed addresses are dropped. When no
     * per-user routing can be resolved (no assigned user, no team, no repo), the
     * admin recipient configured via ASTRAWATCH_ALERT_RECIPIENT is used so alerts
     * are never silently dropped.
     */
    private List<String> resolveRecipients(Incident incident) {
        Set<String> recipients = new LinkedHashSet<>();

        UUID assignedTo = incident != null ? incident.getAssignedTo() : null;
        if (assignedTo != null && userRepository != null) {
            userRepository.findById(assignedTo).ifPresent(assignee -> {
                addIfValid(recipients, assignee.getEmail());
                if (assignee.getTeamId() != null) {
                    for (User member : userRepository.findAllByTeamId(assignee.getTeamId())) {
                        addIfValid(recipients, member.getEmail());
                    }
                }
            });
        }

        if (recipients.isEmpty()) {
            String fallback = (defaultRecipient == null || defaultRecipient.isBlank())
                    ? "admin@astrawatch.io"
                    : defaultRecipient;
            addIfValid(recipients, fallback);
        }
        return new ArrayList<>(recipients);
    }

    private void addIfValid(Set<String> recipients, String email) {
        if (email == null || email.isBlank()) return;
        String normalized = email.trim().toLowerCase();
        if (!unsubscribedEmails.contains(normalized)) {
            recipients.add(normalized);
        }
    }

    @Override
    public void sendAnomalyAlertEmail(Incident incident) {
        if (incident == null) return;

        List<String> recipients = resolveRecipients(incident);
        if (recipients.isEmpty()) {
            log.warn("No recipients resolved for incident {}; skipping email", incident.getId());
            return;
        }

        for (String recipient : recipients) {
            String unsubscribeToken = generateUnsubscribeToken(recipient);
            String unsubscribeUrl = dashboardUrl + "/unsubscribe?token=" + unsubscribeToken;

            // When the auto-PR pipeline opened a remediation PR on the connected
            // repo, surface the link in the alert email (extracted from the
            // resolution note the GitHub service records).
            String prUrl = extractPullRequestUrl(incident.getResolutionNote());

            String htmlBody;
            if (templateEngine != null) {
                Context ctx = new Context();
                ctx.setVariable("incidentId", incident.getId() != null ? incident.getId().toString() : "");
                ctx.setVariable("serviceId", incident.getServiceId() != null ? incident.getServiceId().toString() : "Unknown Service");
                ctx.setVariable("severity", incident.getSeverity() != null ? incident.getSeverity().name() : "HIGH");
                ctx.setVariable("title", incident.getTitle() != null ? incident.getTitle() : "Anomaly Detected");
                ctx.setVariable("description", incident.getDescription() != null ? incident.getDescription() : "No details provided");
                ctx.setVariable("rootCause", incident.getRootCause() != null ? incident.getRootCause() : "Analysis pending — see incident for details.");
                ctx.setVariable("dashboardUrl", dashboardUrl + "/incidents/" + (incident.getId() != null ? incident.getId().toString() : ""));
                ctx.setVariable("prUrl", prUrl != null ? prUrl : "");
                ctx.setVariable("unsubscribeUrl", unsubscribeUrl);
                htmlBody = templateEngine.process("email/anomaly-alert", ctx);
            } else {
                htmlBody = String.format("<h2>Anomaly Alert</h2><p>Service: %s</p><p>Title: %s</p><p>Description: %s</p><p>Root Cause / Diagnosis: %s</p>",
                        incident.getServiceId(), incident.getTitle(), incident.getDescription(),
                        incident.getRootCause() != null ? incident.getRootCause() : "Analysis pending");
            }

            String subject = String.format("[AstraWatch Alert] [%s] Anomaly Detected: %s",
                    incident.getSeverity() != null ? incident.getSeverity().name() : "HIGH",
                    incident.getTitle());

            sendEmailWithRetry(recipient, subject, htmlBody);
        }

        // Fan out to configured Slack/webhook channels (strategy gap 1).
        deliverToChannels(
                "[AstraWatch Alert] [" + (incident.getSeverity() != null ? incident.getSeverity().name() : "HIGH") + "] "
                        + (incident.getTitle() != null ? incident.getTitle() : "Anomaly Detected"),
                (incident.getRootCause() != null ? incident.getRootCause() : "Analysis pending"),
                Map.of(
                        "incident", incident.getId() != null ? incident.getId().toString() : "",
                        "service", incident.getServiceId() != null ? incident.getServiceId().toString() : "",
                        "dashboard", dashboardUrl + "/incidents/" + (incident.getId() != null ? incident.getId().toString() : "")
                )
        );
    }

    @Override
    public void sendHealingStatusEmail(HealingAction action, String status) {
        if (action == null) return;

        // Best-effort per-user routing: the healing action does not carry the
        // incident's assigned user, so we route to the configured admin/on-call
        // recipient (respecting unsubscribes). Incident ownership routing is handled
        // at incident-creation time in sendAnomalyAlertEmail.
        List<String> recipients = resolveHealingRecipients(action);
        if (recipients.isEmpty()) {
            log.warn("No recipients resolved for healing action {}; skipping email", action.getId());
            return;
        }

        boolean pending = "PENDING".equalsIgnoreCase(status != null ? status : "");

        for (String recipient : recipients) {
            String unsubscribeToken = generateUnsubscribeToken(recipient);
            String unsubscribeUrl = dashboardUrl + "/unsubscribe?token=" + unsubscribeToken;

            String htmlBody;
            if (templateEngine != null) {
                Context ctx = new Context();
                ctx.setVariable("actionId", action.getId() != null ? action.getId().toString() : "");
                ctx.setVariable("incidentId", action.getIncidentId() != null ? action.getIncidentId().toString() : "");
                ctx.setVariable("actionType", action.getActionType() != null ? action.getActionType() : "UNKNOWN");
                ctx.setVariable("riskScore", action.getRiskScore());
                ctx.setVariable("status", status != null ? status : action.getStatus().name());
                ctx.setVariable("dashboardUrl", dashboardUrl + "/incidents/" + (action.getIncidentId() != null ? action.getIncidentId().toString() : ""));
                ctx.setVariable("unsubscribeUrl", unsubscribeUrl);
                if (pending) {
                    ctx.setVariable("approveUrl", buildActionUrl(action.getId(), recipient, "approve"));
                    ctx.setVariable("rejectUrl", buildActionUrl(action.getId(), recipient, "reject"));
                }
                htmlBody = templateEngine.process("email/healing-report", ctx);
            } else {
                StringBuilder sb = new StringBuilder();
                sb.append(String.format("<h2>Healing Report</h2><p>Action: %s</p><p>Status: %s</p>",
                        action.getActionType(), status));
                if (pending) {
                    sb.append(String.format("<p><a href='%s'>Approve</a> | <a href='%s'>Reject</a></p>",
                            buildActionUrl(action.getId(), recipient, "approve"),
                            buildActionUrl(action.getId(), recipient, "reject")));
                }
                htmlBody = sb.toString();
            }

            String subject = String.format("[AstraWatch Healing] Action %s: %s (Risk: %d)",
                    status, action.getActionType(), action.getRiskScore());

            sendEmailWithRetry(recipient, subject, htmlBody);
        }

        // Fan out to configured Slack/webhook channels (strategy gap 1).
        deliverToChannels(
                "[AstraWatch Healing] Action " + (status != null ? status : "") + ": "
                        + (action.getActionType() != null ? action.getActionType() : "UNKNOWN"),
                "Healing action risk " + action.getRiskScore(),
                Map.of(
                        "action", action.getId() != null ? action.getId().toString() : "",
                        "incident", action.getIncidentId() != null ? action.getIncidentId().toString() : "",
                        "status", pending ? "awaiting approval" : (status != null ? status : ""),
                        "dashboard", dashboardUrl + "/incidents/" + (action.getIncidentId() != null ? action.getIncidentId().toString() : "")
                )
        );
    }

    private List<String> resolveHealingRecipients(HealingAction action) {
        // Route healing updates to the incident's owner/team when resolvable (F6),
        // falling back to the configured admin recipient.
        Set<String> recipients = new LinkedHashSet<>();
        if (incidentRepository != null && action.getIncidentId() != null) {
            incidentRepository.findById(action.getIncidentId()).ifPresent(incident -> {
                recipients.addAll(resolveRecipients(incident));
            });
        }
        if (recipients.isEmpty()) {
            String fallback = (defaultRecipient == null || defaultRecipient.isBlank())
                    ? "admin@astrawatch.io"
                    : defaultRecipient;
            addIfValid(recipients, fallback);
        }
        return new ArrayList<>(recipients);
    }

    private String buildActionUrl(UUID actionId, String email, String decision) {
        String token = generateActionToken(actionId, email, decision);
        if (token == null) return dashboardUrl + "/incidents";
        return dashboardUrl + "/api/v1/healing/" + decision + "/" + actionId + "?token=" + token;
    }

    private void sendEmailWithRetry(String recipient, String subject, String htmlContent) {
        int maxAttempts = 3;
        long backoffMs = 500;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                if (mailSender == null) {
                    log.warn("JavaMailSender is not configured. Logged email instead:\nTo: {}\nSubject: {}\nBody snippet: {}",
                            recipient, subject, htmlContent.substring(0, Math.min(htmlContent.length(), 200)));
                    return;
                }

                MimeMessage mimeMessage = mailSender.createMimeMessage();
                MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");
                helper.setFrom(mailFrom);
                helper.setTo(recipient);
                helper.setSubject(subject);
                helper.setText(htmlContent, true);

                mailSender.send(mimeMessage);
                log.info("Email successfully sent to {} with subject: {}", recipient, subject);
                return;
            } catch (Exception e) {
                log.warn("Attempt {}/{} failed to send email to {}: {}", attempt, maxAttempts, recipient, e.getMessage());
                if (attempt == maxAttempts) {
                    log.error("Failed to send email after {} attempts: {}", maxAttempts, e.getMessage(), e);
                } else {
                    try {
                        Thread.sleep(backoffMs * attempt);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        }
    }

    // ─── Channel dispatch (audit/strategy gap 1: email-only notifications) ──
    // NotificationChannel rows carry a type ("slack" | "webhook") and a JSON
    // config ({"url": ...}). Alerts fan out to every enabled channel so SRE
    // teams can receive incidents in Slack instead of email-only.

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(java.time.Duration.ofSeconds(5))
            .build();

    /**
     * Dispatches an alert payload to all enabled Slack/webhook channels. Best
     * effort: failures are logged, never thrown (a dead webhook must not break
     * the incident lifecycle).
     */
    private void deliverToChannels(String title, String message, Map<String, String> extras) {
        List<NotificationChannel> channels;
        try {
            channels = notificationRepository.findAllChannels();
        } catch (Exception e) {
            log.warn("Failed to list notification channels: {}", e.getMessage());
            return;
        }
        if (channels == null || channels.isEmpty()) return;

        for (NotificationChannel ch : channels) {
            if (ch == null || !ch.isEnabled()) continue;
            String type = ch.getType() == null ? "" : ch.getType().toLowerCase();
            String config = ch.getConfig();
            if (config == null || config.isBlank()) continue;

            String url = extractUrl(config);
            if (url == null || url.isBlank()) {
                log.warn("Channel {} has no url in config; skipping", ch.getName());
                continue;
            }

            try {
                String payload;
                if ("slack".equals(type)) {
                    payload = buildSlackPayload(title, message, extras);
                } else {
                    payload = buildWebhookPayload(title, message, extras);
                }
                HttpRequest req = HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(payload))
                        .timeout(java.time.Duration.ofSeconds(10))
                        .build();
                HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
                log.info("Delivered alert to channel '{}' ({}): HTTP {}", ch.getName(), type, resp.statusCode());
            } catch (Exception e) {
                log.warn("Failed to deliver alert to channel '{}' ({}): {}", ch.getName(), type, e.getMessage());
            }
        }
    }

    private final com.fasterxml.jackson.databind.ObjectMapper channelMapper = new com.fasterxml.jackson.databind.ObjectMapper();

    /**
     * Extracts the GitHub PR URL from an incident's resolution note. The auto-PR
     * pipeline records it as "GitHub PR: <url>"; returns null when absent so the
     * alert email only links a PR that actually exists.
     */
    private String extractPullRequestUrl(String resolutionNote) {
        if (resolutionNote == null || resolutionNote.isBlank()) return null;
        String marker = "GitHub PR: ";
        int idx = resolutionNote.lastIndexOf(marker);
        if (idx < 0) return null;
        String url = resolutionNote.substring(idx + marker.length()).trim();
        // Cut trailing text on the same line (notes are newline-separated).
        int nl = url.indexOf('\n');
        if (nl >= 0) url = url.substring(0, nl).trim();
        return url.isEmpty() ? null : url;
    }

    private String extractUrl(String config) {
        try {
            var node = channelMapper.readTree(config);
            var url = node != null ? node.get("url") : null;
            return url != null && url.isTextual() ? url.asText() : null;
        } catch (Exception e) {
            log.warn("Channel config is not valid JSON: {}", e.getMessage());
            return null;
        }
    }

    private String buildSlackPayload(String title, String message, Map<String, String> extras) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"text\":\"" + jsonEscape(title) + "\\n" + jsonEscape(message) + "\"");
        if (extras != null && !extras.isEmpty()) {
            sb.append(",\"attachments\":[{\"color\":\"#ff4500\",\"fields\":[");
            boolean first = true;
            for (Map.Entry<String, String> e : extras.entrySet()) {
                if (!first) sb.append(",");
                first = false;
                sb.append("{\"title\":\"" + jsonEscape(e.getKey()) + "\",\"value\":\"" + jsonEscape(e.getValue()) + "\",\"short\":true}");
            }
            sb.append("]}]");
        }
        sb.append("}");
        return sb.toString();
    }

    private String buildWebhookPayload(String title, String message, Map<String, String> extras) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"title\":\"" + jsonEscape(title) + "\",\"message\":\"" + jsonEscape(message) + "\"");
        if (extras != null && !extras.isEmpty()) {
            sb.append(",\"fields\":{");
            boolean first = true;
            for (Map.Entry<String, String> e : extras.entrySet()) {
                if (!first) sb.append(",");
                first = false;
                sb.append("\"" + jsonEscape(e.getKey()) + "\":\"" + jsonEscape(e.getValue()) + "\"");
            }
            sb.append("}");
        }
        sb.append("}");
        return sb.toString();
    }

    private String jsonEscape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
    }

    @Override
    public String generateUnsubscribeToken(String email) {
        try {
            long timestamp = System.currentTimeMillis();
            String payload = email + ":" + timestamp;
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(unsubscribeSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKey);
            byte[] hmacBytes = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            String signature = Base64.getUrlEncoder().withoutPadding().encodeToString(hmacBytes);
            String rawToken = payload + ":" + signature;
            return Base64.getUrlEncoder().withoutPadding().encodeToString(rawToken.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            log.error("Failed to generate unsubscribe token: {}", e.getMessage());
            return Base64.getUrlEncoder().encodeToString(email.getBytes(StandardCharsets.UTF_8));
        }
    }

    @Override
    public boolean verifyUnsubscribeToken(String token) {
        if (token == null || token.isBlank()) return false;
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
            String[] parts = decoded.split(":");
            if (parts.length != 3) return false;
            String email = parts[0];
            long timestamp = Long.parseLong(parts[1]);
            String signature = parts[2];

            String payload = email + ":" + timestamp;
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(unsubscribeSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKey);
            byte[] hmacBytes = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            String expectedSignature = Base64.getUrlEncoder().withoutPadding().encodeToString(hmacBytes);

            return MessageDigestEquals(signature, expectedSignature);
        } catch (Exception e) {
            log.warn("Invalid unsubscribe token: {}", e.getMessage());
            return false;
        }
    }

    @Override
    public boolean unsubscribe(String token) {
        if (!verifyUnsubscribeToken(token)) {
            return false;
        }
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
            String email = decoded.split(":")[0];
            unsubscribedEmails.add(email.trim().toLowerCase());
            log.info("Successfully unsubscribed email: {}", email);
            return true;
        } catch (Exception e) {
            log.error("Failed to unsubscribe with token: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Generates an HMAC-signed token authorizing a one-click approve/reject for a
     * pending healing action (audit F6 — email as control plane). The token binds
     * actionId + recipient email + decision so it cannot be replayed for a
     * different action or decision.
     */
    public String generateActionToken(UUID actionId, String email, String decision) {
        if (actionId == null || email == null || decision == null) return null;
        try {
            String payload = actionId + ":" + email.trim().toLowerCase() + ":" + decision;
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(unsubscribeSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKey);
            String signature = Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
            String rawToken = payload + ":" + signature;
            return Base64.getUrlEncoder().withoutPadding().encodeToString(rawToken.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            log.error("Failed to generate action token: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Verifies an approve/reject token. Returns the bound decision payload or null
     * if the token is malformed, expired by signature mismatch, or forged.
     */
    public ActionDecision verifyActionToken(String token) {
        if (token == null || token.isBlank()) return null;
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
            String[] parts = decoded.split(":");
            if (parts.length != 4) return null;
            UUID actionId = UUID.fromString(parts[0]);
            String email = parts[1];
            String decision = parts[2];
            String signature = parts[3];

            String payload = actionId + ":" + email + ":" + decision;
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(unsubscribeSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKey);
            String expected = Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));

            if (!MessageDigestEquals(signature, expected)) return null;
            return new ActionDecision(actionId, email, decision);
        } catch (Exception e) {
            log.warn("Invalid action token: {}", e.getMessage());
            return null;
        }
    }

    public record ActionDecision(UUID actionId, String email, String decision) {}

    private boolean MessageDigestEquals(String a, String b) {
        return java.security.MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
