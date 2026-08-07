package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.SyntheticCheckResult;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface SyntheticCheckResultRepository extends JpaRepository<SyntheticCheckResult, Long> {
    List<SyntheticCheckResult> findTop50ByCheckIdOrderByCheckedAtDesc(UUID checkId);
    List<SyntheticCheckResult> findTop100ByCheckIdOrderByCheckedAtDesc(UUID checkId);
}
