package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.SyntheticCheck;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface SyntheticCheckRepository extends JpaRepository<SyntheticCheck, UUID> {
    List<SyntheticCheck> findAllByOrgId(UUID orgId);
}
