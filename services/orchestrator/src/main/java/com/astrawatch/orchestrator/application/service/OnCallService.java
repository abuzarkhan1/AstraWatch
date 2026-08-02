package com.astrawatch.orchestrator.application.service;

import com.astrawatch.orchestrator.adapter.out.persistence.OnCallRotationRepository;
import com.astrawatch.orchestrator.domain.model.OnCallRotation;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * On-call rotations (strategy gap 4: the OnCallController previously returned
 * fabricated empty schedules). Rotations now persist in Postgres; the current
 * on-call member is derived deterministically from the rotation start time,
 * member order and shift length — no invented data.
 */
@Slf4j
@Service
public class OnCallService {

    private final OnCallRotationRepository rotationRepository;
    private final ObjectMapper objectMapper;

    @Autowired
    public OnCallService(OnCallRotationRepository rotationRepository, ObjectMapper objectMapper) {
        this.rotationRepository = rotationRepository;
        this.objectMapper = objectMapper;
    }

    public List<OnCallRotation> listRotations(UUID orgId) {
        return orgId != null
                ? rotationRepository.findByOrgId(orgId)
                : rotationRepository.findAll();
    }

    public OnCallRotation createRotation(OnCallRotation rotation) {
        return rotationRepository.save(rotation);
    }

    public Optional<OnCallRotation> getRotation(UUID id) {
        return rotationRepository.findById(id);
    }

    public Optional<OnCallRotation> updateRotation(UUID id, Map<String, Object> body) {
        return rotationRepository.findById(id).map(existing -> {
            if (body.get("name") != null) existing.setName(String.valueOf(body.get("name")));
            if (body.get("description") != null) existing.setDescription(String.valueOf(body.get("description")));
            if (body.get("memberIds") != null) {
                try {
                    existing.setMemberIds(objectMapper.writeValueAsString(body.get("memberIds")));
                } catch (Exception e) {
                    log.warn("Invalid memberIds, keeping existing: {}", e.getMessage());
                }
            }
            if (body.get("shiftLengthHours") != null) existing.setShiftLengthHours(Integer.parseInt(String.valueOf(body.get("shiftLengthHours"))));
            if (body.get("timezone") != null) existing.setTimezone(String.valueOf(body.get("timezone")));
            if (body.get("enabled") != null) existing.setEnabled(Boolean.parseBoolean(String.valueOf(body.get("enabled"))));
            return rotationRepository.save(existing);
        });
    }

    public void deleteRotation(UUID id) {
        rotationRepository.deleteById(id);
    }

    /**
     * Returns the user currently on call for a rotation, computed from the
     * rotation start time and the ordered member list — no fabricated entries.
     */
    public Optional<UUID> currentOnCall(OnCallRotation rotation, Instant at) {
        if (rotation == null || !rotation.isEnabled()) return Optional.empty();
        List<UUID> members = parseMembers(rotation.getMemberIds());
        if (members.isEmpty()) return Optional.empty();

        long shiftHours = rotation.getShiftLengthHours() == null ? 168 : rotation.getShiftLengthHours();
        if (shiftHours <= 0) shiftHours = 168;

        Instant start = rotation.getStartsAt() != null ? rotation.getStartsAt() : rotation.getCreatedAt();
        // Invalid timezone strings must never 500 the endpoint — fall back to UTC.
        ZoneId zone;
        try {
            zone = ZoneId.of(rotation.getTimezone() != null ? rotation.getTimezone() : "UTC");
        } catch (Exception e) {
            zone = ZoneId.of("UTC");
        }
        ZonedDateTime startZ = start.atZone(zone);
        ZonedDateTime atZ = (at != null ? at : Instant.now()).atZone(zone);

        long elapsedHours = java.time.Duration.between(startZ, atZ).toHours();
        if (elapsedHours < 0) elapsedHours = 0;
        int idx = (int) (elapsedHours / shiftHours) % members.size();
        return Optional.of(members.get(idx));
    }

    private List<UUID> parseMembers(String memberIds) {
        if (memberIds == null || memberIds.isBlank()) return new ArrayList<>();
        try {
            return objectMapper.readValue(memberIds, new TypeReference<List<UUID>>() {});
        } catch (Exception e) {
            log.warn("Failed to parse on-call member ids: {}", e.getMessage());
            return new ArrayList<>();
        }
    }
}
