package com.astrawatch.orchestrator.adapter.out.persistence;

import com.astrawatch.orchestrator.domain.model.Incident;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public interface IncidentRepository extends JpaRepository<Incident, UUID> {
    List<Incident> findByServiceIdOrderByCreatedAtDesc(UUID serviceId);
    List<Incident> findByStateOrderByCreatedAtDesc(Incident.IncidentState state);
    long countByServiceIdAndState(UUID serviceId, Incident.IncidentState state);
    boolean existsByAnomalyId(UUID anomalyId);
    java.util.Optional<Incident> findByAnomalyId(UUID anomalyId);
}
