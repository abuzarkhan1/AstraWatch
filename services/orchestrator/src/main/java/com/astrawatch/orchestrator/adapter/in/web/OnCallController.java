package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.application.service.OnCallService;
import com.astrawatch.orchestrator.domain.model.OnCallRotation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * On-call rotations & escalation (strategy gap 4). Previously this controller
 * fabricated empty schedules and invented IDs; it now serves persisted
 * rotations and computes the current on-call member from the shift calendar.
 */
@RestController
@RequestMapping("/api/v1/oncall")
@RequiredArgsConstructor
public class OnCallController {

    private final OnCallService onCallService;

    @GetMapping("/schedules")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getSchedules(@RequestParam(required = false) UUID orgId) {
        List<OnCallRotation> rotations = onCallService.listRotations(orgId);
        List<Map<String, Object>> schedules = rotations.stream().map(r -> {
            UUID current = onCallService.currentOnCall(r, Instant.now()).orElse(null);
            return Map.<String, Object>of(
                    "id", r.getId().toString(),
                    "name", r.getName(),
                    "description", r.getDescription() != null ? r.getDescription() : "",
                    "memberIds", r.getMemberIds(),
                    "shiftLengthHours", r.getShiftLengthHours(),
                    "timezone", r.getTimezone(),
                    "currentOnCall", current != null ? current.toString() : null,
                    "enabled", r.isEnabled()
            );
        }).toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of("schedules", schedules)));
    }

    @PostMapping("/schedules")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createSchedule(@RequestBody OnCallRotation rotation) {
        OnCallRotation saved = onCallService.createRotation(rotation);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.created(Map.of("id", saved.getId().toString(), "name", saved.getName())));
    }

    @PutMapping("/schedules/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateSchedule(@PathVariable UUID id, @RequestBody Map<String, Object> body) {
        return onCallService.updateRotation(id, body)
                .map(r -> ResponseEntity.ok(ApiResponse.ok(Map.<String, Object>of("id", r.getId().toString(), "name", r.getName()))))
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/schedules/{id}")
    public ResponseEntity<Void> deleteSchedule(@PathVariable UUID id) {
        onCallService.deleteRotation(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/schedules/{id}/entries")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getScheduleEntries(@PathVariable UUID id) {
        return onCallService.getRotation(id)
                .map(r -> {
                    UUID current = onCallService.currentOnCall(r, Instant.now()).orElse(null);
                    return ResponseEntity.ok(ApiResponse.ok(Map.<String, Object>of(
                            "rotation", r.getName(),
                            "currentOnCall", current != null ? current.toString() : null,
                            "shiftLengthHours", r.getShiftLengthHours(),
                            "timezone", r.getTimezone()
                    )));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/who-is-on-call")
    public ResponseEntity<ApiResponse<Map<String, Object>>> whoIsOnCall(@RequestParam(required = false) UUID orgId) {
        Map<String, String> result = onCallService.listRotations(orgId).stream()
                .filter(OnCallRotation::isEnabled)
                .collect(java.util.stream.Collectors.toMap(
                        OnCallRotation::getName,
                        r -> onCallService.currentOnCall(r, Instant.now()).map(UUID::toString).orElse("nobody"),
                        (a, b) -> a
                ));
        return ResponseEntity.ok(ApiResponse.ok(Map.of("onCall", result)));
    }
}
