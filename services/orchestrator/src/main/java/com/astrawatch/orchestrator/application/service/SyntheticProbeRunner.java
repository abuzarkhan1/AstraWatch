package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.adapter.out.persistence.SyntheticCheckRepository;
import com.astrawatch.orchestrator.adapter.out.persistence.SyntheticCheckResultRepository;
import com.astrawatch.orchestrator.domain.model.SyntheticCheck;
import com.astrawatch.orchestrator.domain.model.SyntheticCheckResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Real synthetic check runner. Every poll tick it executes the checks whose
 * interval has elapsed and persists each outcome to synthetic_check_results,
 * then refreshes the check's status / response time / last run / rolling
 * uptime. Checks created with status "paused" are never probed (honest —
 * nothing runs until the user toggles the check on).
 *
 * Uptime is computed from the last 100 real executions only, so a freshly
 * enabled check starts as null (no data yet) instead of a fabricated 100%.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SyntheticProbeRunner {

    private final SyntheticCheckRepository checkRepository;
    private final SyntheticCheckResultRepository resultRepository;

    @Value("${astrawatch.synthetics.timeout-ms:10000}")
    private int timeoutMs;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    @Scheduled(fixedDelayString = "${astrawatch.synthetics.poll-ms:5000}")
    @Transactional
    public void runDueChecks() {
        List<SyntheticCheck> checks;
        try {
            checks = checkRepository.findAll();
        } catch (RuntimeException e) {
            log.warn("SyntheticProbeRunner: cannot list checks: {}", e.getMessage());
            return;
        }
        Instant now = Instant.now();
        for (SyntheticCheck check : checks) {
            if ("paused".equalsIgnoreCase(check.getStatus())) {
                continue;
            }
            Instant dueAt = check.getLastRunAt() == null
                    ? Instant.EPOCH
                    : check.getLastRunAt().plusSeconds(secondsOr(check.getIntervalSeconds(), 60));
            if (dueAt.isAfter(now)) {
                continue;
            }
            probe(check);
        }
    }

    private int secondsOr(Integer seconds, int fallback) {
        return seconds != null && seconds > 0 ? seconds : fallback;
    }

    private void probe(SyntheticCheck check) {
        Instant started = Instant.now();
        Outcome outcome = switch (check.getType() == null ? "http" : check.getType().toLowerCase()) {
            case "tcp" -> runTcp(check.getUrl());
            case "dns" -> runDns(check.getUrl());
            default -> runHttp(check.getUrl());
        };
        // Note: Outcome factories are pass()/fail() — the record accessor for
        // the `ok` component is already named ok(), so a static ok() would
        // collide with it.
        long elapsedMs = Duration.between(started, Instant.now()).toMillis();

        resultRepository.save(SyntheticCheckResult.builder()
                .checkId(check.getId())
                .status(outcome.ok ? "passing" : "failing")
                .responseTimeMs((int) Math.max(1, elapsedMs))
                .errorMessage(outcome.error)
                .checkedAt(Instant.now())
                .build());

        check.setStatus(outcome.ok ? "passing" : "failing");
        check.setResponseTimeMs((int) Math.max(1, elapsedMs));
        check.setLastRunAt(Instant.now());
        check.setUptime(computeUptime(check.getId()));
        checkRepository.save(check);

        log.debug("Synthetic probe {}: {} ({}) {}", check.getId(), check.getType(), check.getUrl(),
                outcome.ok ? "pass" : "FAIL: " + outcome.error);
    }

    private Outcome runHttp(String url) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofMillis(timeoutMs))
                    .GET()
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            int code = resp.statusCode();
            boolean ok = code >= 200 && code < 400;
            return ok ? Outcome.pass()
                    : Outcome.fail("HTTP " + code + " for " + url);
        } catch (Exception e) {
            return Outcome.fail(sanitize(e));
        }
    }

    private Outcome runTcp(String target) {
        try {
            String host = null;
            int port = -1;
            // "host:port" / "1.2.3.4:5432" without a scheme — URI.create would
            // mis-parse the hostname as a scheme (or throw for a leading digit).
            java.util.regex.Matcher m = HOST_PORT.matcher(target.trim());
            if (m.matches()) {
                host = m.group(1);
                port = Integer.parseInt(m.group(2));
            } else {
                URI uri = URI.create(target);
                host = uri.getHost();
                port = uri.getPort();
            }
            if (host == null || port <= 0) return Outcome.fail("invalid tcp target: " + target);
            try (var socket = new java.net.Socket()) {
                socket.connect(new java.net.InetSocketAddress(host, port), timeoutMs);
                return Outcome.pass();
            }
        } catch (Exception e) {
            return Outcome.fail(sanitize(e));
        }
    }

    private static final java.util.regex.Pattern HOST_PORT =
            java.util.regex.Pattern.compile("^([^:]+):(\\d{1,5})$");

    private Outcome runDns(String hostname) {
        try {
            String host = hostname.trim();
            if (host.startsWith("http://") || host.startsWith("https://")) {
                host = URI.create(host).getHost();
            }
            InetAddress[] addrs = InetAddress.getAllByName(host);
            if (addrs == null || addrs.length == 0) {
                return Outcome.fail("no addresses for " + hostname);
            }
            return Outcome.pass();
        } catch (Exception e) {
            return Outcome.fail(sanitize(e));
        }
    }

    private String sanitize(Exception e) {
        String msg = e.getMessage();
        if (msg == null || msg.isBlank()) return e.getClass().getSimpleName();
        return msg.length() > 200 ? msg.substring(0, 200) : msg;
    }

    /**
     * Rolling uptime from the last 100 executions; null when the check has no
     * results yet (honest — never a fabricated number).
     */
    private Double computeUptime(UUID checkId) {
        List<SyntheticCheckResult> recent = resultRepository.findTop100ByCheckIdOrderByCheckedAtDesc(checkId);
        if (recent.isEmpty()) return null;
        long passes = recent.stream().filter(r -> "passing".equals(r.getStatus())).count();
        return uptimePercent(passes, recent.size());
    }

    /**
     * Percentage uptime from pass/total observations, rounded to 2 decimals
     * (e.g. 95/100 -> 95.0). Pure helper so the math is unit-testable.
     */
    static double uptimePercent(long passes, long total) {
        if (total <= 0) return 0.0;
        if (passes >= total) return 100.0;
        if (passes <= 0) return 0.0;
        return Math.round((passes * 10000.0) / total) / 100.0;
    }

    private record Outcome(boolean ok, String error) {
        static Outcome pass() { return new Outcome(true, null); }
        static Outcome fail(String error) { return new Outcome(false, error); }
    }
}
