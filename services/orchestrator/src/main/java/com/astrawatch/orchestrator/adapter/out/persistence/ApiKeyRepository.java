package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.ApiKey;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ApiKeyRepository extends JpaRepository<ApiKey, UUID> {
    List<ApiKey> findAllByUserIdAndRevokedFalse(UUID userId);
    List<ApiKey> findAllByRevokedFalse();
    Optional<ApiKey> findByKeyHash(String keyHash);
}
