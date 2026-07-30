package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.in.web.dto.ActionItemDTO;
import com.astrawatch.orchestrator.adapter.in.web.dto.PostmortemDTO;
import com.astrawatch.orchestrator.application.service.PostmortemService;
import com.astrawatch.orchestrator.domain.model.ActionItem;
import com.astrawatch.orchestrator.domain.model.Postmortem;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/incidents/{id}/postmortem")
@RequiredArgsConstructor
public class PostmortemController {

    private final PostmortemService postmortemService;

    @PostMapping
    public ResponseEntity<ApiResponse<PostmortemDTO>> createOrUpdate(@PathVariable UUID id, @RequestBody Postmortem postmortem) {
        PostmortemDTO dto = PostmortemDTO.from(postmortemService.createOrUpdate(id, postmortem));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(dto));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<PostmortemDTO>> get(@PathVariable UUID id) {
        return postmortemService.getByIncident(id)
                .map(p -> ResponseEntity.ok(ApiResponse.ok(PostmortemDTO.from(p))))
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping
    public ResponseEntity<ApiResponse<PostmortemDTO>> update(@PathVariable UUID id, @RequestBody Postmortem postmortem) {
        PostmortemDTO dto = PostmortemDTO.from(postmortemService.createOrUpdate(id, postmortem));
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @PostMapping("/export")
    public ResponseEntity<ApiResponse<Map<String, String>>> export(@PathVariable UUID id, @RequestBody Map<String, String> body) {
        String format = body.getOrDefault("format", "markdown");
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "content", "# Postmortem\n\nIncident: " + id,
                "format", format
        )));
    }

    @GetMapping("/action-items")
    public ResponseEntity<ApiResponse<List<ActionItemDTO>>> getActionItems(@PathVariable UUID id) {
        return postmortemService.getByIncident(id)
                .map(p -> {
                    List<ActionItemDTO> items = postmortemService.getActionItems(p.getId())
                            .stream().map(ActionItemDTO::from).toList();
                    return ResponseEntity.ok(ApiResponse.ok(items));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/action-items")
    public ResponseEntity<ApiResponse<ActionItemDTO>> createActionItem(@PathVariable UUID id, @RequestBody ActionItem item) {
        return postmortemService.getByIncident(id)
                .map(p -> {
                    item.setPostmortemId(p.getId());
                    ActionItemDTO dto = ActionItemDTO.from(postmortemService.createActionItem(item));
                    return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(dto));
                })
                .orElse(ResponseEntity.notFound().build());
    }
}
