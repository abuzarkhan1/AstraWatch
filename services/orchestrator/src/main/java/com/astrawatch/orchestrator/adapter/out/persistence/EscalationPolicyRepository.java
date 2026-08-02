package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.EscalationPolicy;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface EscalationPolicyRepository extends JpaRepository<EscalationPolicy, UUID> {
    List<EscalationPolicy> findByOrgId(UUID orgId);
    List<EscalationPolicy> findByOrgIdAndIsEnabledTrue(UUID orgId);
}
