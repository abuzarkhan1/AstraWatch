package com.astrawatch.orchestrator.adapter.in.web;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/catalog")
public class CatalogController {

    @GetMapping("/services")
    public ResponseEntity<ApiResponse<List<Object>>> getServices() {
        return ResponseEntity.ok(ApiResponse.ok(List.of()));
    }
}
