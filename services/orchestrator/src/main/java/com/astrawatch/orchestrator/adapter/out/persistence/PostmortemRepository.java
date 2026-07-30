package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.Postmortem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PostmortemRepository extends JpaRepository<Postmortem, UUID> {
    Optional<Postmortem> findByIncidentId(UUID incidentId);
}
