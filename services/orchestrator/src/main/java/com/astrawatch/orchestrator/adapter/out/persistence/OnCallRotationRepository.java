package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.OnCallRotation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface OnCallRotationRepository extends JpaRepository<OnCallRotation, UUID> {
    List<OnCallRotation> findByOrgId(UUID orgId);
    List<OnCallRotation> findByOrgIdAndIsEnabledTrue(UUID orgId);
}
