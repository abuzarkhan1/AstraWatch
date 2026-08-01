package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.GitHubIntegration;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GitHubIntegrationRepository extends JpaRepository<GitHubIntegration, UUID> {
    Optional<GitHubIntegration> findByTenantId(UUID tenantId);
    List<GitHubIntegration> findAllByTenantId(UUID tenantId);
}
