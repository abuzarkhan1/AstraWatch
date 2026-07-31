package com.astrawatch.orchestrator.adapter.in.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/synthetics")
public class SyntheticController {

    @GetMapping("/checks")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getChecks(@RequestParam(required = false) UUID orgId) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("checks", List.of())));
    }

    @PostMapping("/checks")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createCheck(@RequestBody Map<String, Object> body) {
        body.put("id", UUID.randomUUID().toString());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(body));
    }

    @GetMapping("/checks/{id}/results")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getCheckResults(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.ok(Map.of("results", List.of())));
    }
}
