package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.GitHubRepository;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GitHubRepositoryRepository extends JpaRepository<GitHubRepository, UUID> {
    Optional<GitHubRepository> findByServiceId(UUID serviceId);
    List<GitHubRepository> findByTenantId(UUID tenantId);
    Optional<GitHubRepository> findByRepoOwnerAndRepoName(String repoOwner, String repoName);
}
