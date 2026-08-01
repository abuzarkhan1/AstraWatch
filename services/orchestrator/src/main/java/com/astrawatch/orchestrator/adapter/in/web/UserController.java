package com.astrawatch.orchestrator.adapter.in.web;

import com.astrawatch.orchestrator.adapter.in.web.dto.UserDTO;
import com.astrawatch.orchestrator.adapter.out.persistence.UserRepository;
import com.astrawatch.orchestrator.domain.model.User;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<ApiResponse<List<UserDTO>>> listUsers() {
        List<UserDTO> users = userRepository.findAll().stream()
                .map(UserDTO::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.ok(users));
    }

    @PutMapping("/{id}/role")
    public ResponseEntity<ApiResponse<UserDTO>> updateUserRole(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body) {
        return userRepository.findById(id)
                .map(user -> {
                    String newRole = body.get("role");
                    if (newRole != null && !newRole.isBlank()) {
                        user.setRole(newRole.trim().toUpperCase());
                    }
                    User updated = userRepository.save(user);
                    return ResponseEntity.ok(ApiResponse.ok(UserDTO.from(updated)));
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/toggle-status")
    public ResponseEntity<ApiResponse<UserDTO>> toggleUserStatus(@PathVariable UUID id) {
        return userRepository.findById(id)
                .map(user -> {
                    user.setActive(!user.isActive());
                    User updated = userRepository.save(user);
                    return ResponseEntity.ok(ApiResponse.ok(UserDTO.from(updated)));
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
