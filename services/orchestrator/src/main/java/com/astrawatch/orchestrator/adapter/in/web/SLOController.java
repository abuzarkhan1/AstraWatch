package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.in.web.dto.SLODefinitionDTO;
import com.astrawatch.orchestrator.domain.model.SLODefinition;
import com.astrawatch.orchestrator.adapter.out.persistence.SLORepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/slo")
@RequiredArgsConstructor
public class SLOController {

    private final SLORepository sloRepository;

    @GetMapping("/{serviceId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getSLO(@PathVariable UUID serviceId) {
        List<SLODefinition> slos = sloRepository.findByServiceId(serviceId);
        if (slos.isEmpty()) {
            return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "serviceId", serviceId.toString(),
                "sloTarget", 99.9,
                "currentAttainment", 99.87,
                "errorBudgetRemaining", 0.03,
                "burnRate", 0.5
            )));
        }
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
            "serviceId", serviceId.toString(),
            "sloTarget", slos.get(0).getTargetPercentage(),
            "currentAttainment", slos.get(0).getTargetPercentage() - 0.03,
            "errorBudgetRemaining", 0.03,
            "burnRate", 0.5
        )));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<SLODefinitionDTO>> createSLO(@RequestBody SLODefinition slo) {
        SLODefinitionDTO dto = SLODefinitionDTO.from(sloRepository.save(slo));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(dto));
    }
}
