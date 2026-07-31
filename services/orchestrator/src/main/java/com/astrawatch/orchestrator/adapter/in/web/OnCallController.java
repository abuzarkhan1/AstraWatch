package com.astrawatch.orchestrator.adapter.in.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/oncall")
public class OnCallController {

    @GetMapping("/schedules")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getSchedules(@RequestParam(required = false) UUID orgId) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("schedules", List.of())));
    }

    @PostMapping("/schedules")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createSchedule(@RequestBody Map<String, Object> body) {
        body.put("id", UUID.randomUUID().toString());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(body));
    }

    @GetMapping("/schedules/{id}/entries")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getScheduleEntries(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("entries", List.of())));
    }
}
